/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : support.ts
 * Created at  : 2026-08-07
 * Author      : jeefo
 * Purpose     : Staff → developer request ("Алдаа мэдэгдэх"), proxied by the
 *               api into the maestro feedback inbox. The api attaches the
 *               sender's name from the session — the client only says what
 *               happened.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {gql} from "@apollo/client";

export const SEND_SUPPORT_REQUEST = gql`
  mutation SendSupportRequest($input: SupportRequestInput!) {
    sendSupportRequest(input: $input)
  }
`;
