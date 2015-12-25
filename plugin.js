const format = require("util").format;
const inspect = require("util").inspect;
const fetch = require("node-fetch");
fetch.Promise = require("bluebird");

function getIssueSummary (options) {
    const user = options.user;
    const repo = options.repo;
    const issueNumber = options.issue;

    return fetch(format("https://api.github.com/repos/%s/%s/issues/%s", user, repo, issueNumber))
    .then(function (res) {
        return res.json();
    })
    .then(function (res) {
        if (res.message === "Not Found") {
            return "Issue does not exist.";
        }

        const type = res.pull_request === undefined ? "Issue" : "PR";
        const status = res.state;
        const title = res.title;
        const link = res.html_url;

        if (type === "PR" && status === "closed") {
            return fetch(res.pull_request.url)
            .then(function (res) {
                return res.json();
            })
            .then(function (res) {
                if (res.message === "Not Found") {
                    return "PR does not exist.";
                }

                const type = "PR";
                const status = res.merged_at === null ? "closed" : "merged";
                const title = res.title;
                const link = res.html_url;

                return format("[%s %s] <%s> %s <%s>", type, issueNumber, status, title, link);
            });
        } else {
            return format("[%s %s] <%s> %s <%s>", type, issueNumber, status, title, link);
        }
    });
}

function withIssue (obj, issueNumber) {
    obj.issue = issueNumber;
    return obj;
}

function stringIsPositiveInteger (string) {
    const number = Number(string);

    if (isNaN(number)) {
        return false;
    }

    if (number === Infinity) {
        return false;
    }

    if (number < 1) {
        return false;
    }

    if (Math.floor(number) !== number) {
        return false;
    }

    return true;
}

module.exports = {
    name: "github",
    init: function (client, deps) {
        const ghUser = client.config("github-user");
        if (!ghUser) { throw new Error("github-user configuration value must be set."); }
        const ghRepo = client.config("github-repo");
        if (!ghRepo) { throw new Error("github-repo configuration value must be set."); }

        /// Takes a string of one of the following formats and turns it into
        /// a {user, repo} object defaulting to the client's config values
        /// for missing values.
        ///
        /// ""
        /// "repo"
        /// "user/repo"
        /// "user/"
        /// "/repo"
        /// "/"
        function parseUserRepoString (userRepoString) {
            if (userRepoString.length === 0) {
                return {user: ghUser, repo: ghRepo};
            }

            if (userRepoString.indexOf("/") === -1) {
                return {user: ghUser, repo: userRepoString};
            }

            const split = userRepoString.split("/");
            const user = split[0].length !== 0 ? split[0] : ghUser;
            const repo = split[1].length !== 0 ? split[1] : ghRepo;

            return {user: user, repo: repo};
        }

        return {
            handlers: {
                "!gh": function (command) {
                    // There's a lot of missing error handling here.
                    // e.g., the Number testing ignores the possibility of NaN.

                    if (command.args.length === 0) {
                        // !gh
                        return format("https://github.com/%s/%s", ghUser, ghRepo);
                    }

                    if (command.args.length === 1) {
                        const arg = command.args[0];

                        if (stringIsPositiveInteger(arg)) {
                            // !gh Number
                            return getIssueSummary({user: ghUser, repo: ghRepo, issue: arg});
                        } else {
                            const userRepo = parseUserRepoString(arg);
                            return format("https://github.com/%s/%s", userRepo.user, userRepo.repo);
                        }
                    }

                    if (command.args.length === 2) {
                        if (stringIsPositiveInteger(command.args[1])) {
                            return getIssueSummary(withIssue(parseUserRepoString(command.args[0]), command.args[1]));
                        } else {
                            return format("https://github.com/%s/%s", command.args[0], command.args[1]);
                        }
                    }

                    if (command.args.length === 3) {
                        return getIssueSummary({
                            user: command.args[0],
                            repo: command.args[1],
                            issue: command.args[2]
                        });
                    }

                    return "!gh [user/repo] issue-number";
                }
            },

            commands: ["gh"],
            help: {
                "gh": ["!gh [user/repo] issue-number"]
            }
        };
    }
};
