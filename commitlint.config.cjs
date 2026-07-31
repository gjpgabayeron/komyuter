module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      [
        "web",
        "ui",
        "mobile",
        "admin",
        "server",
        "shared",
        "db",
        "docs",
        "config",
        "ci",
        "deps",
      ],
    ],
  },
};
