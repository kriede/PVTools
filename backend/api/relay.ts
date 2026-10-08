import {RequestHandler} from "express";
import axios from "axios";

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
        !["re.jrc.ec.europa.eu", "nominatim.openstreetmap.org"].includes(url.hostname)) {
        res.sendStatus(403);
        return;
    }

    try {
        const result = await axios.get(url.href, {
            timeout: 15000,
            maxRedirects: 0,
            headers: {
                "User-Agent": "PVTools/1.0 (https://github.com/kriede/PVTools)",
                "Accept": "application/json"
            }
        });
        res.json(result.data);
    } catch (error) {
        const timedOut = axios.isAxiosError(error) &&
            (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT");
        res.status(timedOut ? 504 : 502).json({
            error: timedOut ? "The upstream service timed out." : "The upstream service could not be reached."
        });
    }
};




