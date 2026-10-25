/**
 * js/text.js
 * App-wide static text and speech phrasing.
 */

(function () {
    const CR = (window.CR = window.CR || {});

    CR.text = {
        // Messages used by the app
        NOTHING_LOADED: "No repository data is loaded yet.",
        END: "You have reached the end of the activity.",
        FIRST: "You are already at the first activity.",
        LAST: "You are already at the last activity.",

        // Voice-command help
        HELP:
            "Available commands are play, pause, next, previous, repeat, details, open, stop, faster, slower, what's new, jump, filter, and help.",

        // Convert one normalized activity item into natural speech
        spokenText(item) {
            if (!item) return "There is no activity to read.";

            const type = item.type === "pr" ? "pull request" : "commit";
            const author = item.author || "Unknown author";
            const title = item.title || "No title";
            const date = item.date ? CR.util.rel(item.date) : "an unknown time";

            let text = `${type} by ${author}. ${title}. ${date}.`;

            if (item.status) {
                text += ` Status: ${item.status}.`;
            }

            return CR.util.clean(text);
        },

        // Intro spoken when the activity stream starts
        introText() {
            if (!CR.state.items.length) {
                return "No repository activity is loaded.";
            }

            const count = CR.state.items.length;

            return `Commit Radio loaded ${count} ${
                count === 1 ? "activity" : "activities"
            }. Starting with the newest update.`;
        }
    };
})();
