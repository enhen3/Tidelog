import obsidianmd from "eslint-plugin-obsidianmd";

export default [
    {
        ignores: ["main.js", "node_modules/**", "*.mjs", "src/**/*.js"],
    },
    ...obsidianmd.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
