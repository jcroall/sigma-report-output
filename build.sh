#!/bin/sh -x
TAG=v0.1.0
npm run-script all && \
  git add dist/* && \
  git commit -m "Automated" && \
  git push && \
  git tag -fa ${TAG} -m "Update tag" && \
  git push -f --tags
