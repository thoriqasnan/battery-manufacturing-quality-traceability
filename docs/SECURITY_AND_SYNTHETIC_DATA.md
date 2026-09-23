# Security and Synthetic-Data Policy

This policy is the source of truth for the public-data boundary and baseline security expectations.

## Public portfolio disclaimer

> This project is an independent portfolio simulation inspired by general battery-manufacturing quality workflows. All products, identifiers, specifications, thresholds, production records, users, and operational data are fictional and synthetically generated.

The system must not present itself as a real company MES, reproduce confidential operational materials, or imply integration with real production systems.

## Prohibited content

Never add any of the following to the repository, documentation, fixtures, screenshots, issues, or demos:

- Private company or customer names
- Real production serial numbers or barcodes
- Internal product codes
- Internal supplier identities
- Employee information
- Internal screenshots or spreadsheets
- Company URLs or endpoints
- Real MES APIs, schemas, or database details
- Proprietary SOPs, work instructions, approval forms, or abnormal-workflow documents
- Confidential specifications, limits, or thresholds
- Real manufacturing records
- Secrets, API keys, tokens, or passwords

Do not copy or reproduce any real company's forms or workflows. General domain concepts must be expressed as fictional, synthetic portfolio behavior.

## Allowed synthetic content

The project may use:

- Fictional product models
- Generated trace codes
- Generic component and process names
- Synthetic thresholds and measurements
- Fictional suppliers such as Supplier A, Supplier B, and Supplier C
- Generated users
- Generated production, inspection, genealogy, and abnormal-case records
- General manufacturing and quality concepts

Synthetic content should be unmistakably fictional, internally consistent enough for testing, and free of patterns that resemble copied real production data.

## Security baseline for future implementation

Future implementation must address:

- Configuration through environment variables
- No secrets in Git
- Secure password hashing
- Secure authentication and session/token handling
- Server-side authorization, independent of UI visibility
- Request and input validation
- Safe error responses without sensitive internals
- Rate limiting where appropriate
- Database constraints and transactional integrity
- Dependency hygiene and review

Exact controls will be designed in the relevant implementation phases. This baseline does not claim that security functionality currently exists.

## Review expectations

Before publishing documentation, examples, seeds, screenshots, logs, or demos:

1. Confirm all names, codes, users, suppliers, measurements, and records are synthetic.
2. Search for credentials, internal endpoints, personal information, and company-specific identifiers.
3. Confirm thresholds and specifications are invented rather than copied.
4. Ensure generalized workflows do not reproduce a proprietary SOP or approval chain.
5. Verify error examples and logs do not reveal secrets or private environment details.

If the provenance of any operational detail is uncertain, exclude or replace it with an explicitly fictional example.
