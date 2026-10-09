import {RequestHandler} from "express";
import axios from "axios";

const ALLOWED_HOSTS = ["re.jrc.ec.europa.eu", "nominatim.openstreetmap.org", "api.energy-charts.info"];

export const relayAPIRequest: RequestHandler = async (req, res) => {
    if (req.body?.method !== "GET") {
        res.sendStatus(403);
        return;
    }

    let url: URL;
    try {
        if (typeof req.body.url !== "string") throw new Error("Missing URL");
        url = new URL(req.body.url);
    } catch {
        res.status(400).json({error: "A valid URL is required."});
        return;
    }

    if (url.protocol !== "https:" || url.username || url.password ||
        (url.port && url.port !== "443") ||
        !ALLOWED_HOSTS.includes(url.hostname)) {
        res.sendStatus(403);
        return;
    }

    if (url.hostname === "api.energy-charts.info" && url.pathname !== "/price") {
        res.sendStatus(403);
        return;
    }

    // Nominatim requires a meaningful application identity; contact details
    // belong in operator configuration, not source or error logs.
    const userAgent = process.env.RELAY_USER_AGENT || "PVTools/1.0 (https://github.com/kriede/PVTools)";
    const email = process.env.NOMINATIM_EMAIL;
    if (url.hostname === "nominatim.openstreetmap.org" && email && !url.searchParams.has("email")) {
        url.searchParams.set("email", email);
    }

    try {
        const result = await axios.get(url.href, {
            // Preserve the local regression contract and fail slow requests
            // promptly rather than keeping the relay open for a full minute.
            timeout: 15000,
            maxRedirects: 0,
            headers: {
                "User-Agent": userAgent,
                "Accept": "application/json"
            }
        });
        res.status(result.status).json(result.data);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            // HTTP failures are upstream responses, not transport failures.
            res.status(error.response.status).json(error.response.data);
            return;
        }
        const timedOut = axios.isAxiosError(error) &&
            (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT");
        res.status(timedOut ? 504 : 502).json({
            error: timedOut ? "The upstream service timed out." : "The upstream service could not be reached."
        });
    }
};
