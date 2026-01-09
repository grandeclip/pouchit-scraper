---
allowed-tools: Read, AskUserQuestion, Write, WebSearch, WebFetch
description: Interview me about the plan
argument-hint: <plan-file-or-description>
---

# Plan Interview

You are conducting an in-depth technical interview about a project plan. Your goal is to deeply understand the implementation details, uncover hidden assumptions, and identify potential issues before implementation begins.

## Step 1: Understand the Input

The user provides: `$ARGUMENTS`

**Determine input type:**

- If it's a file path (contains `/` or ends with `.md`, `.txt`, etc.) → Read the file
- If it's a text description → Use it directly as the project concept

For file input, read and analyze the plan file first.
For text input, use it as the starting point for the interview.

## Step 2: Conduct the Interview

Use the AskUserQuestion tool to ask thoughtful, probing questions. Do NOT ask obvious questions that can be answered by reading the plan.

### Areas to Cover (adapt based on project type)

**Architecture & Technical Design**

- Architecture decisions and alternatives considered
- Data flow and state management approach
- Integration points with existing systems
- Error handling and edge cases
- Performance implications and bottlenecks
- Security considerations and threat model

**Backend & Infrastructure** (if applicable)

- API design, contracts, and versioning strategy
- Database schema, migrations, and data modeling
- Authentication/authorization approach
- Caching strategy and invalidation
- Message queues, event-driven patterns
- Microservices boundaries and communication
- Deployment pipeline and infrastructure requirements

**Frontend & UI/UX** (if applicable)

- User journey and interaction patterns
- Accessibility requirements
- Responsive design considerations
- Loading states and error feedback
- Design system consistency

**AI Agent & LLM** (if applicable)

- Model selection rationale and fallback options
- Prompt engineering approach and iteration strategy
- Tool/function calling design and boundaries
- Memory, context management, and token optimization
- Evaluation metrics and success criteria
- Safety guardrails and content filtering
- Cost optimization and latency requirements
- Handling hallucinations and uncertainty

**Concerns & Tradeoffs**

- What keeps you up at night about this implementation?
- What did you explicitly decide NOT to do?
- What assumptions are you making about users/data/infrastructure?
- What would make you reconsider this approach?
- Dependencies and external factors that could impact delivery

**Scalability & Maintenance**

- How will this evolve over time?
- Testing strategy and coverage expectations
- Monitoring, logging, and observability needs
- Documentation requirements

## Interview Guidelines

- Ask ONE question at a time
- Listen to responses and ask meaningful follow-up questions
- Dig deeper when answers are vague or surface-level
- Challenge assumptions respectfully
- Don't move on until you have clarity
- Continue the interview until all major areas have been thoroughly explored
- Aim for at least 10-15 meaningful exchanges

## Step 3: Write the Specification

After the interview is complete, synthesize all information into a comprehensive specification document. Include relevant sections based on project type:

1. **Overview**: Project summary, goals, and scope
2. **Technical Architecture**: System design, components, and data flow
3. **API & Data Design**: Endpoints, schemas, contracts (if applicable)
4. **User Experience**: UX decisions and rationale (if applicable)
5. **AI/LLM Design**: Model strategy, prompts, tools, guardrails (if applicable)
6. **Implementation Details**: Specific technical requirements and dependencies
7. **Concerns & Mitigations**: Identified risks and how to address them
8. **Open Questions**: Any remaining uncertainties
9. **Success Criteria**: How to measure if the implementation is successful

**Output location:**

- If input was a file → Write spec to same directory with `-spec` suffix
- If input was text → Ask user where to save, default to `./specs/<project-name>-spec.md`

---

**Next step:** After the spec is complete, use `/prd-generator <spec-file>` to generate PRD documents.

---

Begin by understanding the input, then start the interview.
