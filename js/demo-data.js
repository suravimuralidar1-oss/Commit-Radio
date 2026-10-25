/**
 * js/demo-data.js
 * Sample normalized activity data used for offline testing and demos.
 */

(function () {
    const CR = (window.CR = window.CR || {});

    // Repository name shown when demo mode is active
    CR.DEMO_REPO = "commit-radio/demo-repository";

    // Return demo activity using the same structure as the GitHub API
    CR.demoItems = function () {
        return [
            {
                type: "commit",
                id: "a1b2c3d",
                sha: "a1b2c3d",
                title: "Initial commit: Set up core API routes and app architecture",
                body: "",
                author: "Suman",
                date: "2026-10-25T09:30:00Z",
                url: "#",
                demo: true
            },
            {
                type: "commit",
                id: "e4f5g6h",
                sha: "e4f5g6h",
                title: "Add main dashboard layout and accessible CSS theme",
                body: "",
                author: "Keerthana",
                date: "2026-10-25T10:00:00Z",
                url: "#",
                demo: true
            },
            {
                type: "commit",
                id: "i7j8k9l",
                sha: "i7j8k9l",
                title: "Integrate Web Speech API for voice narration of commits",
                body: "",
                author: "Srushti",
                date: "2026-10-25T10:15:00Z",
                url: "#",
                demo: true
            },
            {
                type: "commit",
                id: "m0n1p2q",
                sha: "m0n1p2q",
                title: "Add static phrasing strings, demo data, and README docs",
                body: "",
                author: "Suravi",
                date: "2026-10-25T10:45:00Z",
                url: "#",
                demo: true
            },
            {
                type: "commit",
                id: "r3s4t5u",
                sha: "r3s4t5u",
                title: "Fix commit stream payload parsing and error handling",
                body: "",
                author: "Suman",
                date: "2026-10-25T11:00:00Z",
                url: "#",
                demo: true
            }
        ];
    };
})();
