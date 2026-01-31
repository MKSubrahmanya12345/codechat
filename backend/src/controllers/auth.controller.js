import axios from "axios";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const githubLogin = (req, res) => {
    const redirectUrl = `${process.env.BASE_URL}/api/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirectUrl}&scope=read:user user:email`;
    res.redirect(url);
};

export const githubCallback = async (req, res) => {
    const { code } = req.query;

    try {
        // 1. Exchange Code for Token
        const tokenRes = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code
        }, { headers: { Accept: "application/json" } });

        const accessToken = tokenRes.data.access_token;

        // 2. Get User Info from GitHub
        const userRes = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const { id, login, avatar_url, email } = userRes.data;

        // 3. Find or Create User
        let user = await User.findOne({ githubId: id.toString() });

        if (!user) {
            user = await User.create({
                githubId: id.toString(),
                username: login,
                avatarUrl: avatar_url,
                email: email
            });
        }

        // 4. Generate JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        // 5. Set Cookie
        res.cookie("jwt", token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: "strict"
        });

        // 6. Redirect to Frontend (We will build this next)
        res.redirect(process.env.CLIENT_URL); 

    } catch (error) {
        console.log("Error in callback", error);
        res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
};

export const logout = (req, res) => {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out" });
};

export const checkAuth = (req, res) => {
    try {
        // req.user is already populated by the protectRoute middleware
        console.log("Authenticated User:", req.user);
        res.status(200).json(req.user);
    } catch (error) {
        console.log("Error in checkAuth controller", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};