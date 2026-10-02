export function inspectAIKey(provider, rawKey) {
  const key = (rawKey || "").trim();

  const result = {
    provider,
    configured: Boolean(key),
    length: key.length,
    ascii: /^[\x00-\x7F]*$/.test(key),
    whitespace: /\s/.test(key),
    recognizedFormat: false,
    status: "missing",
    message: ""
  };

  if (!key) {
    result.status = "missing";
    result.message = `${provider} API key is missing.`;
    return result;
  }

  if (!result.ascii) {
    result.status = "invalid";
    result.message = `${provider} API key contains non-ASCII characters.`;
    return result;
  }

  if (result.whitespace) {
    result.status = "invalid";
    result.message = `${provider} API key contains whitespace.`;
    return result;
  }

  if (provider === "openrouter") {
    result.recognizedFormat =
      key.startsWith("sk-or-v1-") ||
      key.startsWith("sk-or-");

    if (!result.recognizedFormat) {
      result.status = "unknown";
      result.message =
        "The OpenRouter key is loaded but does not match a recognized OpenRouter format.";
      return result;
    }
  }

  result.status = "valid-format";
  result.message = `${provider} API key format is recognized.`;

  return result;
}
