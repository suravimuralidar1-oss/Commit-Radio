/*
 * js/ui.js
 * Handles displaying information on the page.
 */

(function () {
    const CR = (window.CR = window.CR || {});
    const $ = CR.$;
    const S = CR.state;

    CR.ui = {

        // Status message 

        setStatus(message, isErr) {
            const status = $("#status");
            if (status) {
                status.textContent = message;
                status.classList.toggle("error", !!isErr);
            }
        },

        /* Render activity list*/

        renderList(pickItem) {
            const activity = $("#activity");

            if (!activity) return;

            activity.innerHTML = "";
            if (!S.items.length) {
                activity.textContent = "No repository activity found.";
                return;
            }

            S.items.forEach((item, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "activity-item";

                const author = item.author || "Unknown author";
                const title = item.title || "Untitled activity";
                const type = item.type === "pr"
                    ? "Pull request"
                    : "Commit";

                button.innerHTML = `
                    <span class="activity-type">${escapeHTML(type)}</span>
                    <strong>${escapeHTML(title)}</strong>
                    <span>by ${escapeHTML(author)}</span>
                `;

                button.addEventListener("click", () => {
                    if (typeof pickItem === "function") {
                        pickItem(index);
                    }
                });
                activity.appendChild(button);
            });
        },

        /* Render current activity */

        render() {
            const player = $("#player");
            if (!player) return;
            const item = S.items[S.idx];

            if (!item) {
                player.textContent = "No activity selected.";
                return;
            }

            const type = item.type === "pr"
                ? "Pull Request"
                : "Commit";
            const author = item.author || "Unknown author";
            const title = item.title || "Untitled activity";

            player.innerHTML = `
                <p class="player-type">${escapeHTML(type)}</p>
                <h2>${escapeHTML(title)}</h2>
                <p>
                    <strong>Author:</strong>
                    ${escapeHTML(author)}
                </p>
                <p>
                    <strong>When:</strong>
                    ${escapeHTML(
                        item.date ? CR.util.rel(item.date) : "Unknown time"
                    )}
                </p>
            `;

            this.updatePlayBtn();
        },

        /* Focus player */

        focusPlayer() {
            const player = $("#player");

            if (player) {
                player.focus();
            }
        },

        /* Play / pause button */

        updatePlayBtn() {
            const button = $("#bPlay");
            if (!button) return;
            if (CR.speech && CR.speech.isSpeaking()) {
                button.textContent = "Pause";
                button.setAttribute("aria-label", "Pause current activity");
            } else {
                button.textContent = "Play";
                button.setAttribute("aria-label", "Play current activity");
            }
        },

        /* Show detailed activity text */

        showDetail(text) {
            const detail = $("#detail");
            if (!detail) return;
            detail.textContent = text || "No additional details available.";
        },

        /* Speech rate label*/

        setRateLabel(rate) {
            const label = $("#rateLabel");
            if (!label) return;
            label.textContent = `${Number(rate).toFixed(1)}×`;
        },

        /*Speaking indicator*/

        setSpeaking(on) {
            const indicator = $("#speaking");

            if (!indicator) return;
            indicator.textContent = on
                ? "Speaking"
                : "Not speaking";
            indicator.setAttribute("aria-live", "polite");
        },

        //Microphone indicator

        setMic(on) {
            const indicator = $("#micStatus");

            if (!indicator) return;

            indicator.textContent = on
                ? "Microphone listening"
                : "Microphone off";

            indicator.setAttribute("aria-live", "polite");
        }
    };

    // Prevent unsafe HTML 
    function escapeHTML(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

})();
