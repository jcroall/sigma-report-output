import {context} from '@actions/github'
import {getSha, relativizePath} from './github/github-context'
import {SigmaIssueOccurrence} from './sigma-schema'
import {log} from 'util'
import {info} from '@actions/core'

export const UNKNOWN_FILE = 'Unknown File'
export const COMMENT_PREFACE = '<!-- Comment managed by sigma-report-output action, do not modify! -->'

export const uuidCommentOf = (issue: SigmaIssueOccurrence): string => `<!-- ${issue.uuid} -->`

export function createMessageFromIssue(issue: SigmaIssueOccurrence): string {
  const issueName = issue.summary
  const checkerNameString = issue.checker_id
  const impactString = issue.severity ? issue.severity.impact : 'Unknown'
  const cweString = issue.taxonomies?.cwe ? `, CWE-${issue.taxonomies?.cwe[0]}` : ''
  const description = issue.desc
  const remediation = issue.remediation ? issue.remediation : 'Not available'
  const remediationString = issue.remediation ? `## How to fix\r\n ${remediation}` : ''
  const suggestion = undefined

  // JC: Assume only one fix for now
  // TODO: Follow up with roadmap plans for fixes
  if (issue.fixes) {
    let suggestion = undefined
    let fix = issue.fixes[0]

    info(`DEBUG: Fix included, start line=${fix.actions[0].location.start.line} col=${fix.actions[0].location.start.column} byte=${fix.actions[0].location.start.byte}`)

    const nthline = require('nthline'),
      filePath = issue['filepath'],
      rowIndex = fix.actions[0].location.start.line - 1
    var current_line = nthline(rowIndex, filePath)

    suggestion = current_line.substring(0, fix.actions[0].location.start.column - 1) + fix.actions[0].contents + current_line.substring(fix.actions[0].location.end.column - 1, current_line.length)
  }

  const suggestionString = suggestion ? '\n```' + suggestion + '\n```' : ''

  return `${COMMENT_PREFACE}
${uuidCommentOf(issue)}
# Sigma Issue - ${issueName}
${description}

_${impactString} Impact${cweString}_ ${checkerNameString}

${remediationString}

${suggestionString}
`
}

export function createMessageFromIssueWithLineInformation(issue: SigmaIssueOccurrence): string {
  const message = createMessageFromIssue(issue)
  const relativePath = relativizePath(issue.filepath)

  info(`DEBUG: issue.filepath=${issue.filepath}`)

  return `${message}
## Issue location
This issue was discovered outside the diff for this Pull Request. You can find it at:
[${relativePath}:${issue.location.start.line}](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${relativePath}#L${issue.location.start.line})
`
}

export function getDiffMap(rawDiff: string): DiffMap {
  console.info('Gathering diffs...')
  const diffMap = new Map()

  let path = UNKNOWN_FILE
  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('diff --git')) {
      // TODO: Handle spaces in path
      path = `${process.env.GITHUB_WORKSPACE}/${line.split(' ')[2].substring(2)}`
      if (path === undefined) {
        path = UNKNOWN_FILE
      }

      path = relativizePath(path)

      diffMap.set(path, [])
    }

    if (line.startsWith('@@')) {
      let changedLines = line.substring(3)
      changedLines = changedLines.substring(0, changedLines.indexOf(' @@'))

      const linesAddedPosition = changedLines.indexOf('+')
      if (linesAddedPosition > -1) {
        // We only care about the right side because Sigma can only analyze what's there, not what used to be --rotte FEB 2022
        const linesAddedString = changedLines.substring(linesAddedPosition + 1)
        const separatorPosition = linesAddedString.indexOf(',')

        const startLine = parseInt(linesAddedString.substring(0, separatorPosition))
        const lineCount = parseInt(linesAddedString.substring(separatorPosition + 1))
        const endLine = startLine + lineCount - 1

        if (!diffMap.has(path)) {
          diffMap.set(path, [])
        }
        console.info(`Added ${path}: ${startLine} to ${endLine}`)
        diffMap.get(path)?.push({firstLine: startLine, lastLine: endLine})
      }
    }
  }

  return diffMap
}

export type DiffMap = Map<string, Hunk[]>

export interface Hunk {
  firstLine: number
  lastLine: number
}
