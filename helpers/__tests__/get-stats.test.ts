import { describe, it, expect } from 'vitest'
import { getStats } from '../get-stats'
import type { Question } from '@/lib/schemas/quiz'

describe('getStats', () => {
  const mockQuestions: Question[] = [
    {
      id: 'q1',
      questionText: 'What is the meaning of "sacca"?',
      options: [
        { id: 'q1truth', text: 'Truth' },
        { id: 'q1false1', text: 'Fruit' },
        { id: 'q1false2', text: 'Water' },
        { id: 'q1false3', text: 'Fire' },
      ],
      answerId: 'q1truth',
    },
    {
      id: 'q2',
      questionText: 'What is "dhamma"?',
      options: [
        { id: 'q2truth', text: 'Truth/Teaching' },
        { id: 'q2false1', text: 'King' },
        { id: 'q2false2', text: 'Food' },
        { id: 'q2false3', text: 'Road' },
      ],
      answerId: 'q2truth',
    },
    {
      id: 'q3',
      questionText: 'What is "puggala"?',
      options: [
        { id: 'q3truth', text: 'Person/Being' },
        { id: 'q3false1', text: 'Tree' },
        { id: 'q3false2', text: 'Stone' },
        { id: 'q3false3', text: 'Cloud' },
      ],
      answerId: 'q3truth',
    },
  ]

  it('returns zero progress when no answers', () => {
    const result = getStats(mockQuestions, {})
    expect(result.answeredQuestionsCount).toBe(0)
    expect(result.progressPercentage).toBe(0)
    expect(result.allQuestionsAnswered).toBe(false)
  })

  it('calculates correct progress percentage', () => {
    const result = getStats(mockQuestions, { q1: 'q1truth' })
    expect(result.answeredQuestionsCount).toBe(1)
    expect(result.progressPercentage).toBeCloseTo(33.33, 1)
  })

  it('identifies all questions answered', () => {
    const result = getStats(mockQuestions, {
      q1: 'q1truth',
      q2: 'q2false1',
      q3: 'q3truth',
    })
    expect(result.allQuestionsAnswered).toBe(true)
  })

  it('calculates correct score', () => {
    const result = getStats(mockQuestions, {
      q1: 'q1truth',
      q2: 'q2truth',
      q3: 'q3false1', // wrong answer
    })
    expect(result.score.correct).toBe(2)
    expect(result.score.total).toBe(3)
    expect(result.score.percentage).toBe(67)
  })

  it('counts time-expired as incorrect', () => {
    const result = getStats(mockQuestions, {
      q1: 'q1truth',
      q2: 'time-expired',
      q3: 'q3false2',
    })
    expect(result.score.correct).toBe(1)
    expect(result.score.percentage).toBe(33)
  })

  it('handles empty questions array', () => {
    const result = getStats([], {})
    expect(result.answeredQuestionsCount).toBe(0)
    // Empty questions with 0 answers = NaN percentage (division by zero)
    expect(Number.isNaN(result.progressPercentage)).toBe(true)
    expect(result.allQuestionsAnswered).toBe(false)
    expect(result.score.total).toBe(0)
    expect(Number.isNaN(result.score.percentage)).toBe(true)
  })
})