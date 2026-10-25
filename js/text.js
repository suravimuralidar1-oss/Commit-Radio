
/**
 * js/text.js
 * App-wide static text, UI labels, and phrasing templates.
 */

const AppText = {
    title: "Commit Radio",
    subtitle: "Listen to your repository's commit activity.",
    buttons: {
        play: "Play Commits",
        pause: "Pause",
        settings: "Settings",
        loadDemo: "Load Demo Data"
    },
    status: {
        idle: "Ready to stream commits...",
        loading: "Fetching repository data...",
        playing: "Now playing commit:",
        error: "Failed to fetch commit data. Please check the repository details."
    },
    labels: {
        author: "Author",
        message: "Commit Message",
        hash: "Commit Hash",
        date: "Date"
    }
};

export default AppText;
