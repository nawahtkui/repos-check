#!/bin/bash

# غيّر USERNAME باسم حسابك في GitHub
USERNAME="YOUR_USERNAME"

REPORT="repos_status_report.txt"
echo "تقرير جاهزية المستودعات - $(date)" > $REPORT
echo "-------------------------------------" >> $REPORT

gh repo list $USERNAME --limit 100 --json name,url | jq -r '.[] | "\(.name) \(.url)"' | while read repo url; do
    echo "جارٍ فحص: $repo ..."
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 "$url" "$TEMP_DIR" > /dev/null 2>&1

    STATUS="❌ غير جاهز"
    if [ -f "$TEMP_DIR/index.html" ] || [ -d "$TEMP_DIR/src" ]; then
        STATUS="⚠ يحتاج تعديل"
    fi
    if [ -f "$TEMP_DIR/index.html" ] && [ -d "$TEMP_DIR/src" ]; then
        STATUS="✅ جاهز للنشر"
    fi

    echo "$repo - $STATUS" >> $REPORT
    rm -rf "$TEMP_DIR"
done

echo "تم إنشاء التقرير في $REPORT"
