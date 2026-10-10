# Security and safety

## Reporting a vulnerability

If you find a security problem in the site or the workflows, please do not open a public issue. Use GitHub's private vulnerability reporting (Security tab > Report a vulnerability) once a maintainer has enabled it in Settings > Code security.

## Things to keep in mind

- **Issue content is public and untrusted.** The site writes every title and region with `textContent`, never as HTML. Keep it that way when changing `docs/app.js`.
- **Workflows run with a limited token.** Each workflow lists the smallest permissions it needs. If you add a workflow, do the same.
- **Never put secrets in the repository.** The hub needs none.
- **Personal information.** If someone posts a home address, phone number or other private detail, edit or delete it quickly and tell them why.
