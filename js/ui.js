/*
 * Handles displaying information on the page.
 * Does not handle GitHub API calls or speech.
 */

/* Status Message */

function updateStatus(message) {
    const status = document.getElementById("status");

    if (status) {
        status.textContent = message;
    }
}

/* Activity Display*/

function showActivity(message) {
    const activity = document.getElementById("activity");

    if (activity) {
        activity.textContent = message;
    }
}


/*Show Current Commit*/

function showCurrentCommit(commit) {
    const activity = document.getElementById("activity");

    if (!activity || !commit) {
        return;
    }

    activity.innerHTML = `
        <h3>${commit.message || "Commit"}</h3>
        <p>
            <strong>Author:</strong>
            ${commit.author || "Unknown"}
        </p>
        <p>
            <strong>Date:</strong>
            ${commit.date || "Unknown"}
        </p>
    `;
}

/* Show Loading State*/

function showLoading() {
    updateStatus("Loading repository activity...");
    showActivity("Fetching commits and pull requests...");
}

/* Show Error*/

function showError(message) {
    updateStatus("Error: " + message);
    showActivity("Unable to load repository activity.");
}
