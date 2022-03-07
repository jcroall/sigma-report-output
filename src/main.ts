import fs from 'fs'
import {createIssueComment, createReview, getExistingIssueComments, getExistingReviewComments, getPullRequestDiff, updateExistingIssueComment, updateExistingReviewComment} from './github/pull-request'
import {SigmaIssuesView, SigmaIssueOccurrence} from './sigma-schema'
import {
  COMMENT_PREFACE,
  createMessageFromIssue,
  createMessageFromIssueWithLineInformation,
  DiffMap,
  getDiffMap,
  uuidCommentOf
} from './reporting'
import {isPullRequest, relativizePath} from './github/github-context'
import {JSON_FILE_PATH} from './inputs'
import {info} from '@actions/core'
import {NewReviewComment} from './_namespaces/github'

async function run(): Promise<void> {
  info(`Using JSON file path: ${JSON_FILE_PATH}`)

  // TODO validate file exists and is .json?
  const jsonContent = fs.readFileSync(JSON_FILE_PATH)
  const sigmaIssues = JSON.parse(jsonContent.toString()) as SigmaIssuesView

  if (isPullRequest()) {
    const newReviewComments = []
    const existingReviewComments = await getExistingReviewComments()
    const existingIssueComments = await getExistingIssueComments()
    const diffMap = await getPullRequestDiff().then(getDiffMap)

    for (const issue of sigmaIssues.issues.issues) {
      info(`Found Coverity Issue ${issue.uuid} at ${issue.filepath}:${issue.location.start.line}`)
      const mergeKeyComment = uuidCommentOf(issue)
      const reviewCommentBody = createMessageFromIssue(issue)
      const issueCommentBody = createMessageFromIssueWithLineInformation(issue)

      const existingMatchingReviewComment = existingReviewComments
        .filter(comment => comment.line === issue.location.start.line)
        .filter(comment => comment.body.includes(COMMENT_PREFACE))
        .find(comment => comment.body.includes(mergeKeyComment))

      const existingMatchingIssueComment = existingIssueComments.filter(comment => comment.body?.includes(COMMENT_PREFACE)).find(comment => comment.body?.includes(mergeKeyComment))

      if (existingMatchingReviewComment !== undefined) {
        info(`Issue already reported in comment ${existingMatchingReviewComment.id}, updating...`)
        updateExistingReviewComment(existingMatchingReviewComment.id, reviewCommentBody)
      } else if (existingMatchingIssueComment !== undefined) {
        info(`Issue already reported in comment ${existingMatchingIssueComment.id}, updating...`)
        updateExistingIssueComment(existingMatchingIssueComment.id, issueCommentBody)
      } else if (isInDiff(issue, diffMap)) {
        info('Issue not reported, adding a comment to the review.')
        newReviewComments.push(createReviewComment(issue, reviewCommentBody))
      } else {
        info('Issue not reported, adding an issue comment.')
        createIssueComment(issueCommentBody)
      }
    }

    if (newReviewComments.length > 0) {
      info('Publishing review...')
      createReview(newReviewComments)
    }
  }

  info(`Found ${sigmaIssues.issues.issues.length} Coverity issues.`)
}

function isInDiff(issue: SigmaIssueOccurrence, diffMap: DiffMap): boolean {
  const diffHunks = diffMap.get(issue.filepath)

  if (!diffHunks) {
    return false
  }

  return diffHunks.filter(hunk => hunk.firstLine <= issue.location.start.line).some(hunk => issue.location.start.line <= hunk.lastLine)
}

function createReviewComment(issue: SigmaIssueOccurrence, commentBody: string): NewReviewComment {
  return {
    path: relativizePath(issue.filepath),
    body: commentBody,
    line: issue.location.start.line,
    side: 'RIGHT'
  }
}

run()
