export interface AccountIdFormats {
  base64AccountId: string;
  hexAccountId: string;
}

export const formatAccountId = (accountId: string): AccountIdFormats => {
  const numericAccountId = BigInt(accountId);
  const bigEndianHex = numericAccountId.toString(16).padStart(16, "0");
  const littleEndianBuffer = Buffer.from(bigEndianHex, "hex").reverse();

  return {
    base64AccountId: littleEndianBuffer.toString("base64"),
    hexAccountId: littleEndianBuffer.toString("hex")
  };
};

