const toErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    value: error
  };
};

export const logError = (
  message: string,
  context: Record<string, unknown>,
  error: unknown
): void => {
  console.error(message, {
    ...context,
    error: toErrorDetails(error)
  });
};

