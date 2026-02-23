/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SMSHUB_BASE_URL = "https://app.smshubangola.com/api";

const _Deno = (globalThis as any).Deno;

_Deno.serve(async (req: any) => {
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

        if (!recipient || !message) {
            return new Response(JSON.stringify({ error: "Recipient and message are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const authId = _Deno.env.get("SMSHUB_AUTH_ID");
        const secretKey = _Deno.env.get("SMSHUB_SECRET_KEY");

        if (!authId || !secretKey) {
            return new Response(JSON.stringify({ error: "SMS Hub credentials not configured" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        console.log(`[Edge Function] Authenticating for recipient: ${recipient}`);

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
            console.error("[Edge Function] No token received. Auth Data keys:", Object.keys(authData));
            return new Response(JSON.stringify({ error: "Authentication successful but no token received", authData }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        console.log("[Edge Function] Token acquired. Sending SMS...");

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
        console.log("[Edge Function] SMS Hub response status:", sendResponse.status);

        // 3. Log the SMS if successful
        const companyId = body.company_id;
        if (sendResponse.ok && companyId) {
            try {
                // @ts-ignore: Deno handles URL imports
                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
                const supabaseUrl = _Deno.env.get("SUPABASE_URL") ?? "";
                const supabaseServiceRoleKey = _Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

                if (supabaseUrl && supabaseServiceRoleKey) {
                    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
                    await supabaseAdmin.from("sms_logs").insert([{
                        company_id: companyId,
                        recipient: recipient,
                        message: message,
                        cost: 5 // Default cost
                    }]);
                    console.log("[Edge Function] SMS logged successfully for company:", companyId);
                }
            } catch (logError) {
                console.error("[Edge Function] Failed to log SMS:", logError);
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
