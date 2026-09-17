import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getMoverById, listMovers } from "./mover-search.service";
import {
  parseMoverSearchIdParams,
  parseMoverSearchQuery,
} from "./mover-search.validator";

export const listMoversController: RequestHandler = async (
  request,
  response,
) => {
  const query = parseMoverSearchQuery(request.query);
  const result = await listMovers(query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

export const getMoverByIdController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = parseMoverSearchIdParams(request.params);
  const mover = await getMoverById(id);

  return sendSuccess(response, HTTP_STATUS.OK, { mover });
};
