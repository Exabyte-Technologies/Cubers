// Local simulator protocol only. Never imported by the production application.
export function simulatedModeration(body = {}) {
  const keys = [
    "sexual",
    "sexual/minors",
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit",
    "illicit/violent",
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
    "violence",
    "violence/graphic",
  ];
  return {
    id: "cubers-simulated-moderation",
    model:
      typeof body.model === "string" ? body.model : "omni-moderation-latest",
    results: [
      {
        flagged: false,
        categories: Object.fromEntries(keys.map((key) => [key, false])),
        category_scores: Object.fromEntries(keys.map((key) => [key, 0])),
        category_applied_input_types: Object.fromEntries(
          keys.map((key) => [key, ["text"]]),
        ),
      },
    ],
  };
}
