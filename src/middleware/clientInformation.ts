import type { RequestHandler } from "express";

const CLIENT_INFORMATION_PATTERN =
  /^(akira|chiaki-ng)-([A-Za-z0-9][A-Za-z0-9._-]*)$/;

export interface ParsedClientInformation {
  clientName: "akira" | "chiaki-ng";
  clientVersion: string;
}

export const parseClientInformation = (
  clientInformation: string | undefined
): ParsedClientInformation | null => {
  if (!clientInformation) {
    return null;
  }

  const match = clientInformation.match(CLIENT_INFORMATION_PATTERN);

  if (!match) {
    return null;
  }

  return {
    clientName: match[1] as "akira" | "chiaki-ng",
    clientVersion: match[2]
  };
};

export const createClientInformationMiddleware = (): RequestHandler => {
  return (request, response, next) => {
    const parsed = parseClientInformation(
      request.header("x-client-information")
    );

    if (!request.header("x-client-information")) {
      response.status(400).json({
        error: "Invalid Client"
      });
      return;
    }

    if (!parsed) {
      response.status(400).json({
        error: "Invalid Client"
      });
      return;
    }

    response.locals.clientName = parsed.clientName;
    response.locals.clientVersion = parsed.clientVersion;

    next();
  };
};
