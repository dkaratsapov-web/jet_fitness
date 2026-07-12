// Placeholder for the initial Cloud Function version created by Terraform.
// The real application code is deployed by the GitHub Actions pipeline
// (.github/workflows/deploy.yml), which pushes new versions to this function.
// Terraform ignores subsequent version changes (see lifecycle in main.tf).
module.exports.handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status: 'placeholder', service: 'jet-fitness-api' }),
});
