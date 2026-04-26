import type { RequestHandler } from "express";

const CLIENT_INFORMATION_PATTERN =
  /^(akira|chiaki-ng)-[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const createClientInformationMiddleware = (): RequestHandler => {
  return (request, response, next) => {
    const clientInformation = request.header("x-client-information");

    if (!clientInformation) {
      response.status(400).json({
        error:
          'Missing required header "X-Client-Information". Expected "akira-{version}" or "chiaki-ng-{version}".'
      });
      return;
    }

    if (!CLIENT_INFORMATION_PATTERN.test(clientInformation)) {
      response.status(400).json({
        error:
          'Invalid "X-Client-Information" header. Expected "akira-{version}" or "chiaki-ng-{version}".'
      });
      return;
    }

    next();
  };
};

