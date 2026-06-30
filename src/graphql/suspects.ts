/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : suspects.ts
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {gql} from "@apollo/client";

export const SUSPECTS_QUERY = gql`
  query Suspects {
    suspects {
      id
      suspectId
      fullName
      aliases
      city
      country
      riskLevel
      photoData
      initials
    }
  }
`;

export const SUSPECT_DETAIL_QUERY = gql`
  query SuspectDetail($id: Int!) {
    suspect(id: $id) {
      id
      suspectId
      fullName
      aliases
      nationalId
      passportNumber
      dateOfBirth
      gender
      address
      city
      country
      primaryPhone
      email
      occupation
      organization
      riskLevel
      notes
      photoData
      status
      createdAt
      updatedAt
      initials
      age
      bankAccounts {
        id
        accountNumber
        bankName
        accountType
        currency
        currentBalance
        status
        maskedNumber
      }
      phoneNumbers {
        id
        number
        provider
        phoneType
        status
      }
      tags {
        id
        tag
        color
      }
      recordCounts {
        transactionCount
        callRecordCount
      }
    }
  }
`;

export const CREATE_SUSPECT = gql`
  mutation CreateSuspect($input: SuspectInput!) {
    createSuspect(input: $input) {
      id
      suspectId
      fullName
      riskLevel
    }
  }
`;

export const UPDATE_SUSPECT = gql`
  mutation UpdateSuspect($id: Int!, $input: SuspectInput!) {
    updateSuspect(id: $id, input: $input) {
      id
      fullName
      riskLevel
    }
  }
`;

export const DELETE_SUSPECT = gql`
  mutation DeleteSuspect($id: Int!) {
    deleteSuspect(id: $id)
  }
`;
