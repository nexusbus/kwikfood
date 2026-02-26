import { createClient } from "@supabase/supabase-js";

const SMSHUB_BASE_URL = "https://app.smshubangola.com/api";

Deno.serve(async (req: Request) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST",
                "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
            },
        });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const { recipient, message } = body as { recipient?: string; message?: string };
        const companyId = body.company_id;

        console.log(`[Edge Function] SMS Request for recipient: ${recipient}, Company: ${companyId}`);

        if (!recipient || !message) {
            return new Response(JSON.stringify({ error: "Recipient and message are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const authId = Deno.env.get("SMSHUB_AUTH_ID");
        const secretKey = Deno.env.get("SMSHUB_SECRET_KEY");

        if (!authId || !secretKey) {
            console.error("[Edge Function] Error: SMSHUB credentials missing");
            return new Response(JSON.stringify({ error: "SMS Hub credentials not configured" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 1. Authenticate to get token
        const authResponse = await fetch(`${SMSHUB_BASE_URL}/authentication`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authId, secretKey }),
        });

        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            console.error("[Edge Function] Auth failed:", errorText);
            return new Response(JSON.stringify({ error: "Failed to authenticate with SMS Hub", details: errorText }), {
                status: authResponse.status,
                headers: { "Content-Type": "application/json" },
            });
        }

        const authData = await authResponse.json().catch(() => ({}));
        const accessToken = (authData as any).data?.authToken || (authData as any).token || (authData as any).accessToken || authResponse.headers.get("accessToken");

        if (!accessToken) {
            console.error("[Edge Function] No token received.");
            return new Response(JSON.stringify({ error: "Authentication successful but no token received" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 2. Send SMS
        const sendResponse = await fetch(`${SMSHUB_BASE_URL}/sendsms`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "accessToken": accessToken,
            },
            body: JSON.stringify({
                contactNo: [recipient],
                message: message,
                from: "KWIKFOOD",
            }),
        });

        const sendData = await sendResponse.json().catch(() => ({}));
        console.log("[Edge Function] SMS Hub response status:", sendResponse.status, sendData);

        // 3. Log the SMS if successful
        if (sendResponse.ok && companyId) {
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

                if (supabaseUrl && supabaseServiceRoleKey) {
                    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
                    const { error: logError } = await supabaseAdmin.from("sms_logs").insert([{
                        company_id: companyId,
                        recipient: recipient,
                        message: message,
                        cost: 5
                    }]);

                    if (logError) {
                        console.error("[Edge Function] Database Insert Error:", logError);
                    } else {
                        console.log("[Edge Function] SMS logged successfully for company:", companyId);
                    }
                } else {
                    console.warn("[Edge Function] Warning: SUPABASE_SERVICE_ROLE_KEY missing, cannot log SMS.");
                }
            } catch (logErr) {
                console.error("[Edge Function] Exception during logging:", logErr);
            }
        }

        return new Response(JSON.stringify(sendData), {
            status: sendResponse.status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });

    } catch (error: any) {
        console.error("[Edge Function] Critical error:", error);
        return new Response(JSON.stringify({ error: error?.message || "Internal Server Error" }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
});
