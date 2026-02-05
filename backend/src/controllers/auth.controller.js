import axios from "axios";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

/**
 * STEP 1: Redirect user to GitHub OAuth
 */
export const githubLogin = (req, res) => {
    const redirectUrl = `${process.env.BASE_URL}/api/auth/github/callback`;

    const githubAuthUrl =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${process.env.GITHUB_CLIENT_ID}` +
        `&redirect_uri=${redirectUrl}` +
        `&scope=read:user user:email repo`;

    res.redirect(githubAuthUrl);
};

/**
 * STEP 2: GitHub OAuth Callback
 * Handles:
 *  - Token exchange
 *  - User fetch
 *  - DB upsert
 *  - JWT generation
 *  - Browser cookie
 *  - VS Code deep-link redirect
 */
export const githubCallback = async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.redirect(
            `${process.env.CLIENT_URL}/login?error=missing_code`
        );
    }

    try {
        /* ----------------------------------------------------
           1. Exchange GitHub code → access token
        ---------------------------------------------------- */
        const tokenRes = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            },
            {
                headers: {
                    Accept: "application/json",
                },
            }
        );

        const accessToken = tokenRes.data.access_token;

        if (!accessToken) {
            throw new Error("GitHub access token missing");
        }

        /* ----------------------------------------------------
           2. Fetch GitHub user profile
        ---------------------------------------------------- */
        const userRes = await axios.get(
            "https://api.github.com/user",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const {
            id,
            login,
            avatar_url,
            email,
        } = userRes.data;

        /* ----------------------------------------------------
           3. Upsert user in DB (token always refreshed)
        ---------------------------------------------------- */
        let user = await User.findOne({ githubId: id.toString() });

        if (user) {
            user = await User.findByIdAndUpdate(
                user._id,
                {
                    username: login,
                    avatarUrl: avatar_url,
                    email,
                    githubToken: accessToken,
                    status: "active"
                },
                { new: true }
            );
        } else {
            const shadow = await User.findOne({ username: login, status: "shadow" });
            if (shadow) {
                user = await User.findByIdAndUpdate(
                    shadow._id,
                    {
                        githubId: id.toString(),
                        username: login,
                        avatarUrl: avatar_url,
                        email,
                        githubToken: accessToken,
                        status: "active"
                    },
                    { new: true }
                );
            } else {
                user = await User.findOneAndUpdate(
                    { githubId: id.toString() },
                    {
                        username: login,
                        avatarUrl: avatar_url,
                        email,
                        githubToken: accessToken,
                        status: "active"
                    },
                    {
                        new: true,
                        upsert: true,
                    }
                );
            }
        }

        /* ----------------------------------------------------
           4. Generate JWT
        ---------------------------------------------------- */
        const jwtToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        /* ----------------------------------------------------
           5. Set browser cookie (OAuth-safe)
        ---------------------------------------------------- */
        res.cookie("jwt", jwtToken, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: "lax", // REQUIRED for OAuth
            secure: process.env.NODE_ENV === "production",
        });

        /* ----------------------------------------------------
           6. Redirect to Web App
        ---------------------------------------------------- */
        res.redirect(
            `${process.env.CLIENT_URL}/home`
        );

    } catch (error) {
        console.error("GitHub OAuth Callback Error:", error);
        res.redirect(
            `${process.env.CLIENT_URL}/login?error=auth_failed`
        );
    }
};

/**
 * Logout (browser only)
 */
export const logout = (req, res) => {
    res.cookie("jwt", "", {
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({ message: "Logged out" });
};

/**
 * Check Auth (protected route)
 * req.user populated by protectRoute middleware
 */
export const checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.error("checkAuth error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
