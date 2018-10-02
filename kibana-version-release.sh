#!/bin/bash

if [[ $# -eq 0 ]] ; then
    echo 'Please provide a Kibana version!'
    exit 1
fi

KIBANA_VERSION=$1
mkdir -p releases/

yarn build -k $KIBANA_VERSION
for BUILD_FILE in build/comparable_time_range-*; do
  RELEASE_FILE=$(echo $BUILD_FILE | sed -E "s/(^build)(\/comparable_time_range-.+)\.zip$/releases\2-kibana-$KIBANA_VERSION.zip/")
  mv -v "$BUILD_FILE" "$RELEASE_FILE"
done

echo 'Done!'
