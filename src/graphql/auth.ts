/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : auth.ts
 * Created at  : 2026-07-05
 * Author      : jeefo
 * Purpose     : GraphQL operations for login, the current account, and the
 *               admin (department boss) account + case-access management.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {gql} from "@apollo/client";

const USER_FIELDS = "id username fullName role active";
// deviceBound only matters in the admin list; keep it off the small `me` payload.
const ADMIN_USER_FIELDS = `${USER_FIELDS} deviceBound`;

export const ME_QUERY = gql`
  query Me { me { ${USER_FIELDS} } }
`;

export const LOGIN = gql`
  mutation Login($username: String!, $password: String!, $deviceId: String) {
    login(username: $username, password: $password, deviceId: $deviceId) {
      token user { ${USER_FIELDS} }
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout { logout }
`;

// --- Admin: user management ------------------------------------------------
export const USERS_QUERY = gql`
  query Users { users { ${ADMIN_USER_FIELDS} } }
`;

export const RESET_USER_DEVICE = gql`
  mutation ResetUserDevice($userId: Int!) {
    resetUserDevice(userId: $userId)
  }
`;

export const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { ${USER_FIELDS} }
  }
`;

export const SET_USER_ACTIVE = gql`
  mutation SetUserActive($userId: Int!, $active: Boolean!) {
    setUserActive(userId: $userId, active: $active) { ${USER_FIELDS} }
  }
`;

export const RESET_USER_PASSWORD = gql`
  mutation ResetUserPassword($userId: Int!, $password: String!) {
    resetUserPassword(userId: $userId, password: $password)
  }
`;

// --- Admin: case access control -------------------------------------------
// Cases with their owner, for the access-control panel.
export const ADMIN_CASES_QUERY = gql`
  query AdminCases {
    caseFiles { id caseId caseName status ownerUserId }
    users { ${USER_FIELDS} }
  }
`;

export const CASE_MEMBERS_QUERY = gql`
  query CaseMembers($caseFileId: Int!) {
    caseMembers(caseFileId: $caseFileId) { ${USER_FIELDS} }
  }
`;

export const GRANT_CASE_ACCESS = gql`
  mutation GrantCaseAccess($caseFileId: Int!, $userId: Int!) {
    grantCaseAccess(caseFileId: $caseFileId, userId: $userId)
  }
`;

export const REVOKE_CASE_ACCESS = gql`
  mutation RevokeCaseAccess($caseFileId: Int!, $userId: Int!) {
    revokeCaseAccess(caseFileId: $caseFileId, userId: $userId)
  }
`;
