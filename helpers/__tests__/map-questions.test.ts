import { describe, it, expect } from 'vitest'
import { mapQuestionsFromResponse } from '../map-questions'

describe('mapQuestionsFromResponse', () => {
  it('maps response questions to QuizQuestion format', () => {
    const responseQuestions = [
      {
        question: 'What is sacca?',
        answer: 'Truth',
        option1: 'Fruit',
        option2: 'Water',
        option3: 'Fire',
      },
    ]

    const result = mapQuestionsFromResponse(responseQuestions)

    expect(result).toHaveLength(1)
    expect(result[0].questionText).toBe('What is sacca?')
    expect(result[0].id).toBe('What is sacca?0')
    expect(result[0].options).toHaveLength(4)
    expect(result[0].answerId).toBe('TruthWhat is sacca?')
  })

  it('filters out questions with missing required fields', () => {
    const responseQuestions = [
      {
        question: 'Valid question',
        answer: 'Answer',
        option1: 'Option1',
        option2: 'Option2',
        option3: 'Option3',
      },
      {
        question: undefined,
        answer: 'Answer',
        option1: 'Option1',
        option2: 'Option2',
        option3: 'Option3',
      },
      {
        question: 'Another valid',
        answer: 'Answer',
        option1: 'Option1',
        option2: 'Option2',
        option3: 'Option3',
      },
    ]

    const result = mapQuestionsFromResponse(responseQuestions)

    expect(result).toHaveLength(2)
    expect(result[0].questionText).toBe('Valid question')
    expect(result[1].questionText).toBe('Another valid')
  })

  it('generates unique IDs using question text and index', () => {
    const responseQuestions = [
      { question: 'Question A', answer: 'A', option1: 'B', option2: 'C', option3: 'D' },
      { question: 'Question A', answer: 'A', option1: 'B', option2: 'C', option3: 'D' },
    ]

    const result = mapQuestionsFromResponse(responseQuestions)

    expect(result[0].id).toBe('Question A0')
    expect(result[1].id).toBe('Question A1')
  })

  it('handles empty array', () => {
    const result = mapQuestionsFromResponse([])
    expect(result).toHaveLength(0)
  })

  it('creates option IDs from option text and question', () => {
    const responseQuestions = [
      { question: 'Test?', answer: 'Correct', option1: 'Wrong1', option2: 'Wrong2', option3: 'Wrong3' },
    ]

    const result = mapQuestionsFromResponse(responseQuestions)

    // options array order: [option1, option2, option3, answer]
    expect(result[0].options[0].id).toBe('Wrong1Test?')
    expect(result[0].options[1].id).toBe('Wrong2Test?')
    expect(result[0].options[2].id).toBe('Wrong3Test?')
    expect(result[0].options[3].id).toBe('CorrectTest?')
  })
})