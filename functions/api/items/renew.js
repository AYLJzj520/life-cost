import {
  handleRequestError,
  json,
} from "../../../api-utils.js";
import { getTodayDateString } from "../../../date-utils.js";
import { renewExpiredItems } from "../items.js";

export async function onRequestPost(context) {
  try {
    const result = await renewExpiredItems(context.env.DB, getTodayDateString());
    return json(result);
  } catch (error) {
    return handleRequestError(error);
  }
}
