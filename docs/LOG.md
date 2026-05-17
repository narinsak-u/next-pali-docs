[Error [AI_RetryError]: Failed after 3 attempts. Last error: Rate limit exceeded. Please try again later.] {
  cause: undefined,
  reason: 'maxRetriesExceeded',
  errors: [Array],
  lastError: [Error [AI_APICallError]: Rate limit exceeded. Please try again later.] {
    cause: undefined,
    url: 'https://opencode.ai/zen/v1/chat/completions',
    requestBodyValues: {
      model: 'big-pickle',
      user: undefined,
      max_tokens: undefined,
      temperature: undefined,
      top_p: undefined,
      frequency_penalty: undefined,
      presence_penalty: undefined,
      response_format: undefined,
      stop: undefined,
      seed: undefined,
      reasoning_effort: undefined,
      messages: [Array],
      tools: undefined,
      tool_choice: undefined,
      stream: true,
      stream_options: undefined
    },
    statusCode: 429,
    responseHeaders: {
      'cf-ray': '9fd3908a8fbfefac-PDX',
      connection: 'keep-alive',
      'content-length': '126',
      'content-type': 'text/plain;charset=UTF-8',
      date: 'Sun, 17 May 2026 15:13:10 GMT',
      'retry-after': '31610',
      server: 'cloudflare'
    },
    responseBody: '{"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."},"metadata":{}}',
    isRetryable: true,
    data: { error: [Object] }
  }
}
 POST /api/ai 200 in 9988ms