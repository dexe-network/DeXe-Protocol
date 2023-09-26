#!/bin/bash

npm run generate-docs

echo "markups have been generated. Moving..."

mkdir -p docs
rsync -av --delete ./generated-markups/contracts/interfaces/ ./docs
