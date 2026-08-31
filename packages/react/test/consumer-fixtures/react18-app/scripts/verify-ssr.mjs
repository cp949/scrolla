import { JSDOM } from "jsdom";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { Scrolla } from "@cp949/scrolla-react";
import { verifySsrContract } from "../../../consumer-contract/verify-ssr.mjs";

await verifySsrContract({
  JSDOM,
  React,
  renderToString,
  hydrateRoot,
  Scrolla,
});
