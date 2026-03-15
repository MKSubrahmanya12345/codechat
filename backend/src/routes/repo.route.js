import express from "express";
import {
    getRepos,
    getRepoMessages,
    getRepoFiles,
    getFileContent,
    getCodeAnchor,
    pullRepo,
    pushRepo,
    getLocalFilePath,
    getLocalFileContent,
    updateLocalFileContent,
    createRepo
} from "../controllers/repo.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";
import {
    getAppStructure,
    getDependencyGraph,
    getDataFlowGraph,
    testDataFlowApi
} from "../controllers/visualizer.controller.js";

const router = express.Router();

router.get("/", protectRoute, getRepos);
router.post("/create", protectRoute, createRepo);

router.get("/:repoId/messages", protectRoute, getRepoMessages);
router.get("/files", protectRoute, getRepoFiles);
router.get("/content", protectRoute, getFileContent);
router.get("/local-content", protectRoute, getLocalFileContent);
router.put("/local-content", protectRoute, updateLocalFileContent);
router.post("/code-anchor", protectRoute, getCodeAnchor);
router.post("/pull", protectRoute, pullRepo);
router.post("/push", protectRoute, pushRepo);
router.get("/local-path", protectRoute, getLocalFilePath);

router.get("/visualize/structure", protectRoute, getAppStructure);
router.get("/visualize/dependencies", protectRoute, getDependencyGraph);
router.get("/visualize/data-flow", protectRoute, getDataFlowGraph);
router.post("/visualize/data-flow/test", protectRoute, testDataFlowApi);

export default router;
