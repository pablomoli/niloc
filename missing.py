#!/usr/bin/env python3
"""
1) Read in data.xlsx and two “processed” files.
2) Build a set of all processed Num values.
3) Write all rows from data.xlsx whose Num is NOT in that set to to_be_processed.xlsx.
4) Load invoices_review.xlsx and compare its Num values to those in to_be_processed.xlsx,
   printing any mismatches.
"""

import pandas as pd


def main():
    # 1) Load your sheets
    df_data = pd.read_excel("data.xlsx", engine="openpyxl")
    df_est = pd.read_excel("processed_valid_addr_estimates.xlsx", engine="openpyxl")
    df_inv = pd.read_excel("processed_valid_invoices.xlsx", engine="openpyxl")

    # 2) Extract processed "Num" lists, drop NaN, turn into sets
    est_nums = set(df_est["Num"].dropna().tolist())
    inv_nums = set(df_inv["Num"].dropna().tolist())
    processed_nums = est_nums.union(inv_nums)

    # 3) Filter data.xlsx for rows whose Num is NOT in processed_nums
    #    Note: pass a list to isin() to satisfy the pandas type-checker
    df_to_be = df_data.loc[~df_data["Num"].isin(list(processed_nums))].copy()
    df_to_be.to_excel("to_be_processed.xlsx", index=False, engine="openpyxl")
    print(f"✅ Wrote {len(df_to_be)} rows to to_be_processed.xlsx")

    # 4) Compare against invoices_review.xlsx
    df_review = pd.read_excel("invoices_review.xlsx", engine="openpyxl")
    review_nums = set(df_review["Num"].dropna().tolist())
    to_be_nums = set(df_to_be["Num"].dropna().tolist())

    missing_in_to_be = review_nums - to_be_nums
    missing_in_review = to_be_nums - review_nums

    if missing_in_to_be:
        print(
            "\n⚠️ These Num values are in invoices_review.xlsx but NOT in to_be_processed.xlsx:"
        )
        for num in sorted(missing_in_to_be):
            print("  ", num)
    else:
        print(
            "\n✅ All Num values from invoices_review.xlsx are present in to_be_processed.xlsx"
        )

    if missing_in_review:
        print(
            "\n⚠️ These Num values are in to_be_processed.xlsx but NOT in invoices_review.xlsx:"
        )
        for num in sorted(missing_in_review):
            print("  ", num)
    else:
        print(
            "\n✅ All Num values in to_be_processed.xlsx are accounted for in invoices_review.xlsx"
        )


if __name__ == "__main__":
    main()
