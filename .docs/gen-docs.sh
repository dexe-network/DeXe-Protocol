#!/bin/bash

rm -rf generated-markups

npm run generate-markups

echo "Markups have been generated. Moving..."

mkdir -p docs
rsync -av --delete generated-markups/contracts/interfaces/ docs

rm -r generated-markups
