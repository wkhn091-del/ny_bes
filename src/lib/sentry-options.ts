/** Shared Sentry privacy settings: never ship cookies, bodies, query strings or user identity. */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { allow: ['user-agent', 'content-type', 'accept-language'] },
  httpBodies: [] as never[],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
};
