# GitHub Actions

Always pin actions to full commit SHAs, not version tags. Use the version tag as an inline comment for readability:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

To find the SHA for a tag, fetch `https://api.github.com/repos/{owner}/{repo}/tags` and use the `commit.sha` field for the desired tag.
