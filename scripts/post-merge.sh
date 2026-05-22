#!/bin/bash
set -e
npm install

# drizzle-kit push interactively asks "is this table/column created or renamed
# from <other>?" whenever it thinks it sees a rename. Its detection produces
# false positives often enough that the prompt has silently stalled production
# schema updates multiple times (see .agents/memory/albums-schema-drift.md).
# In each prompt the default highlighted option is "+ create" — exactly what
# we want for additive schema changes — so we feed newlines to accept the
# default for every prompt. `yes ""` keeps emitting blank lines until db:push
# exits; SIGPIPE on `yes` is harmless and `set -e` still surfaces a real
# db:push failure as the script's exit code.
yes "" | npm run db:push
