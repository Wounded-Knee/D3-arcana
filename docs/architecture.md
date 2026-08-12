## Portability Requirement

The system shall not depend directly on AWS-specific infrastructure from domain or application code. External infrastructure shall be accessed through capability-oriented interfaces and replaceable adapters. AWS implementations shall reside within an infrastructure adapter layer. No cloud-specific functionality shall be introduced into the domain model merely for deployment convenience.

A successful domain operation produces a temporal fact.