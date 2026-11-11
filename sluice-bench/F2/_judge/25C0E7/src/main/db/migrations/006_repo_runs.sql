-- B2 (v1.3): the station plate's pipeline line. default_branch: the repository's default ref, from the
-- repository list (NULL for an empty repo, or until the next listing). run_json: `{ readAt, run? }`, the
-- latest build on that branch (03 §2 RepoRun) and when it was read; no `run` means the repository has no
-- run; NULL until read. Own columns, so re-listing the repository never loses them. Additive: nothing is
-- cleared, and derived tables don't hold it, so no DERIVATION_VERSION bump.
ALTER TABLE repositories ADD COLUMN default_branch TEXT;
ALTER TABLE repositories ADD COLUMN run_json TEXT;
