import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SMSHUB_BASE_URL = "https://app.smshubangola.com/api";

Deno.serve(async (req) => {
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
        const { recipient, message } = await req.json();

        if (!recipient || !message) {
            return new Response(JSON.stringify({ error: "Recipient and message are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const authId = Deno.env.get("SMSHUB_AUTH_ID");
        const secretKey = Deno.env.get("SMSHUB_SECRET_KEY");

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

        // According to snippet, it might be in headers or body. Let's try to get it.
        // Usually it's in a JSON body.
        const authData = await authResponse.json().catch(() => ({}));
        const accessToken = authData.token || authData.accessToken || authResponse.headers.get("accessToken");

        if (!accessToken) {
            console.error("[Edge Function] No token received. Auth Data:", authData);
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
            }),
        });

        const sendData = await sendResponse.json().catch(() => ({}));
        console.log("[Edge Function] SMS Hub response:", sendData);

        return new Response(JSON.stringify(sendData), {
            status: sendResponse.status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });

    } catch (error) {
        console.error("[Edge Function] Critical error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
});
