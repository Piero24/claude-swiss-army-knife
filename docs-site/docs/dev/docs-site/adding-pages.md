---
sidebar_position: 2
---

# Adding Documentation Pages

How to add new pages to the Docusaurus documentation site.

## File Format

Pages use standard Markdown with YAML frontmatter:

```markdown
---
sidebar_position: 3
---

# Page Title

Content goes here...
```

## Adding to Sidebar

After creating a file in `docs-site/docs/`, add it to `docs-site/sidebars.ts`:

```typescript
{
  type: "category",
  label: "Getting Started",
  items: [
    "user/getting-started/prerequisites",
    "user/getting-started/installation",
    "user/getting-started/configuration",  // New page added here
  ],
},
```

The path in the sidebar matches the file path relative to `docs/`, without the `.md` extension.

## Frontmatter Options

| Field | Description |
|---|---|
| `sidebar_position` | Position within the sidebar category (1-based) |
| `title` | Override the page title (default: first heading) |
| `description` | Meta description for SEO |
| `hide_table_of_contents` | Hide the right-side TOC |
| `toc_min_heading_level` | Minimum heading level for TOC (default: 2) |
| `toc_max_heading_level` | Maximum heading level for TOC (default: 3) |

## Adding Images

Place images in `docs-site/static/img/` and reference them:

```markdown
![Alt text](/img/screenshots/dashboard.png)
```

Docusaurus serves the `static/` directory at the site root.

## Adding Code Blocks

Use fenced code blocks with language:

````markdown
```python
def hello():
    print("Hello")
```
````

Line highlighting:

````markdown
```python {2-4}
def hello():
    print("Line 1")
    print("Line 2")
    print("Line 3")
```
````

## Admonitions

Docusaurus supports callout boxes:

```markdown
:::tip
This is a helpful tip.
:::

:::caution
This is a warning.
:::

:::danger
This is dangerous.
:::
```
