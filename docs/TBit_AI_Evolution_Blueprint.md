# T-Bit 2.0 — AI Evolution & Modernization Blueprint

## 0. Purpose

This document defines the target scope, architecture, principles, boundaries, and ordered roadmap for transforming the existing T-Bit 2.0 application into a modern AI-native, multi-agent, graph-engineered, verifiable and self-improving AI system.

This document is intended to be evaluated by Qwen and used to correct, validate, or reject previous recommendations.

The objective is **not** to replace a functioning T-Bit architecture.

The objective is to **evolve the existing AI layer while preserving the functioning T-Bit storage, Q-Vault, memory persistence, and visualization systems**.

---

# 1. Current-System Principle

T-Bit already has substantial functionality.

The existing system must be treated as the baseline implementation.

The modernization project must follow this principle:

> **Extend first. Reuse first. Replace only when source-code evidence proves replacement is necessary.**

No architectural replacement may be proposed merely because a newer design is theoretically cleaner.

Every proposed modification must answer:

1. What existing capability does it replace?
2. Why is the current capability insufficient?
3. What source-code evidence proves the limitation?
4. Can the improvement be implemented as an extension instead?
5. What existing functionality could regress?

If these questions cannot be answered from repository evidence, the change must not be proposed as mandatory.

---

# 2. Absolute Scope Boundary

## 2.1 In Scope

This project focuses exclusively on the **AI system of T-Bit**.

The scope includes:

- LLM providers
- AI provider routing
- AI orchestration
- agent runtime
- existing `.github/agents`
- agent registry
- agent contracts
- agent execution
- tools
- permissions related to AI execution
- context construction
- prompt engineering
- graph engineering
- graph prompting
- execution graphs
- multi-agent workflows
- consensus
- evidence
- verification
- arbitration
- evaluation
- model routing
- loops
- recursive execution
- scheduling of AI tasks
- optimization
- prompt/version management
- tracing
- lineage
- AI observability
- AI-related use of persistent memory
- AI-related use of existing indexes
- AI-related use of existing document/code analysis capabilities
- AI-related APIs
- AI-related UI controls/panels, if required

---

# 3. Absolute Non-Goals

The following must NOT be modified, redesigned, migrated, replaced, or rearchitected as part of this project unless a future, explicit decision changes the scope.

## 3.1 Q-Vault

Do not redesign Q-Vault.

Do not replace its storage architecture.

Do not migrate it to another database.

Do not change its physical storage model.

Do not alter its persistent-memory semantics.

## 3.2 3D Visualization

Do not modify:

- 3D map architecture
- Three.js visualization
- camera behavior
- dynamic plane
- node positioning
- node close-up behavior
- VIT visualization
- Anti-VIT visualization
- memory visualization

The 3D map represents persistent T-Bit memory.

It is NOT the Graph Engineering execution graph.

## 3.3 2D Memory Map

Do not redesign or replace the existing 2D memory map.

Do not reinterpret its nodes or edges as AI execution graphs.

Its purpose remains visualization of persistent memory.

## 3.4 Storage Engine

Do not migrate the storage engine to SQLite or another database as part of this AI modernization.

Do not rewrite:

- physical T-Bit storage
- deterministic allocation
- V/Anti-V storage
- WAL
- storage integrity
- container structure
- existing persistence mechanisms

Existing storage capabilities should be consumed by the AI layer through their existing interfaces.

## 3.5 Unrelated Frontend Refactoring

Do not perform broad UI refactoring merely to accommodate the AI architecture.

Only add or minimally modify UI components required to operate the new AI capabilities.

---

# 4. Critical Conceptual Separation

T-Bit contains several different meanings of "graph".

They MUST NOT be conflated.

## 4.1 Persistent Memory Graph

This already exists.

It represents relationships among persistent user data.

It is visualized through the existing 2D/3D T-Bit interface.

It must remain unchanged.

## 4.2 Execution Graph

A logical graph representing execution dependencies between AI tasks or agents.

Example:

```text
Task
 |
 +--> Research
 |
 +--> Analysis
 |
 +--> Verification
 |
 +--> Synthesis
```

This graph is computational.

It does not replace or modify the memory map.

## 4.3 Agent Graph

A graph representing agents and their execution relationships.

Example:

```text
Planner
  |
  +--> Researcher
  |
  +--> Analyst
  |
  +--> Verifier
          |
          v
      Synthesizer
```

## 4.4 Evidence / Lineage Graph

A graph representing:

```text
Claim
  |
  +--> Evidence
  |
  +--> Source
  |
  +--> Agent
  |
  +--> Verification
```

## 4.5 Graph Engineering

Graph Engineering refers to using structured execution relationships, dependencies, state, evidence, routing and verification to control AI work.

It is NOT the existing T-Bit visual memory graph.

---

# 5. Existing `.github/agents` — Important Correction

The agents in `.github/agents` were manually copied into T-Bit.

They are currently specifications/files, not connected runtime agents.

This is intentional project input.

The objective is to transform these definitions into actual executable agents.

Therefore:

```text
.github/agents/*.md
        |
        v
Agent Loader
        |
        v
Agent Registry
        |
        v
Agent Definition
        |
        v
Agent Runtime
        |
        v
LLM Provider
        |
        v
Tools + Context + Memory
```

The Markdown files must not be treated as executable code.

They are agent specifications that must be parsed, validated, normalized and instantiated by the runtime.

---

# 6. Agent System

The target system must support:

- agent identity
- role
- responsibilities
- capabilities
- tools
- permissions
- system instructions
- model requirements
- input contract
- output contract
- context requirements
- evidence requirements
- execution constraints
- timeout
- retry policy
- cost/latency constraints
- version
- provenance
- evaluation status

An agent must be a runtime entity, not merely a prompt.

---

# 7. Agent Registry

A registry should provide:

- discovery
- loading
- validation
- versioning
- capability lookup
- tool availability
- permission validation
- model compatibility
- lifecycle management

Example conceptual contract:

```text
AgentDefinition
 ├── id
 ├── version
 ├── role
 ├── capabilities
 ├── tools
 ├── permissions
 ├── modelRequirements
 ├── inputSchema
 ├── outputSchema
 ├── systemInstructions
 └── executionPolicy
```

The exact implementation must be derived from the actual repository architecture.

Do not invent an incompatible framework before inspecting the existing code.

---

# 8. Graph Engineering

Graph Engineering is a new AI execution capability.

It should allow T-Bit to represent AI work as structured execution graphs.

The graph must support, where justified:

- nodes
- edges
- dependencies
- parallel branches
- sequential branches
- fan-out
- fan-in
- reduction
- verification
- synthesis
- conditional routing
- retries
- loops
- termination conditions
- human gates
- error propagation
- evidence propagation
- state propagation

A graph must be validated before execution.

---

# 9. Graph Validation

The graph engine should detect at minimum:

- invalid nodes
- missing dependencies
- invalid references
- cycles where DAG execution is required
- impossible dependencies
- unreachable nodes
- invalid fan-in
- invalid fan-out
- missing inputs
- missing outputs
- incompatible agent capabilities

"Fake edges" or semantically invalid relationships must be detectable where the contract permits such validation.

No graph should execute merely because it is syntactically valid.

---

# 10. Graph Executor

A Graph Executor should provide a controlled execution runtime.

A possible execution model is:

```text
Plan
  |
Validate
  |
Route
  |
Fan-Out
  |
Execute
  |
Collect
  |
Reduce
  |
Verify
  |
Synthesize
  |
Evaluate
  |
Complete / Retry / Replan
```

This is a conceptual target.

The implementation must be adapted to the actual T-Bit runtime.

Do not create a second independent AI runtime if the existing `TBitChatEngine`, provider factory, tools and permissions can be extended.

---

# 11. Model Router

T-Bit already supports multiple AI providers.

The modernization should improve routing rather than duplicate provider infrastructure.

The router should eventually consider:

- task type
- required capability
- context size
- structured-output capability
- tool-calling capability
- reasoning requirements
- latency
- cost
- availability
- local/cloud preference
- privacy requirements
- model reliability
- historical evaluation results

Possible routing:

```text
Task
 |
Capability Matcher
 |
Model Router
 |
Provider Adapter
 |
Model
```

Existing provider abstractions should be reused.

---

# 12. Multi-Agent Execution

The system should evolve from:

```text
User
 |
Single LLM
 |
Tools
 |
Answer
```

toward:

```text
User
 |
Request Analyzer
 |
Task Classifier
 |
Capability Matcher
 |
Planner
 |
Execution Graph
 |
+--------+--------+
|        |        |
Agent A Agent B Agent C
|        |        |
+--------+--------+
         |
     Verification
         |
      Consensus
         |
     Synthesis
         |
       Result
```

This does not mean every request must invoke multiple agents.

Simple requests should remain simple.

Multi-agent execution should be selected only when the task benefits from it.

---

# 13. Consensus

Consensus must not be implemented as:

```text
Model A says X
Model B says X
Model C says X
=> X is true
```

The target system should distinguish:

- agreement
- evidence
- contradiction
- confidence
- provenance
- verification
- dissent

A consensus result should contain enough metadata to explain how it was reached.

Example:

```text
Claim
 |
 +--> Agent A
 |      |
 |      +--> Evidence
 |
 +--> Agent B
 |      |
 |      +--> Evidence
 |
 +--> Agent C
        |
        +--> Counter-evidence
 |
 v
Verification
 |
 v
Arbitration
 |
 v
Consensus / Unresolved
```

Unresolved disagreement is a valid outcome.

---

# 14. Evidence and Claims

AI outputs should be distinguishable from verified information.

The system should eventually support:

```text
Claim
Evidence
Source
Agent
Model
Timestamp
Verification
Confidence
Contradiction
Provenance
```

This is particularly important for research, code analysis and technical decisions.

---

# 15. Graph Prompting

Graph Engineering should evolve prompting beyond a single flat prompt.

Instead of only:

```text
System Prompt
+
User Prompt
+
History
```

the system can construct context from:

```text
Task
+
Agent Role
+
Relevant Memory
+
Evidence
+
Graph Dependencies
+
Previous Node Outputs
+
Tool Results
+
Constraints
+
Verification Requirements
```

The final prompt is generated from structured execution state.

This does not mean prompts disappear.

Prompting becomes one component of a larger execution system.

---

# 16. Context Engineering

Context construction should become explicit.

The system should determine:

- what context is relevant
- what context is irrelevant
- what evidence is required
- what previous node outputs are needed
- what persistent memory is relevant
- what tool results are relevant
- what information must be excluded
- context size constraints
- priority
- provenance

Existing T-Bit memory and indexes should be reused.

---

# 17. Loop Engineering

The system should evolve beyond one-shot execution.

A controlled loop may be:

```text
Generate
   |
Execute
   |
Evaluate
   |
Remember
   |
Plan
   |
Improve
   |
Retry / Continue / Stop
```

Possible loop layers:

1. Tool loop
2. Agent loop
3. Graph loop
4. Verification loop
5. Optimization loop
6. Long-running improvement loop

Every loop requires:

- maximum iterations
- timeout
- termination condition
- failure handling
- state limits
- resource limits
- observability

"No infinite autonomous loops" is mandatory.

---

# 18. Evaluation

The AI system requires measurable evaluation.

Evaluation should eventually cover:

- correctness
- factual consistency
- tool correctness
- evidence quality
- task completion
- latency
- cost
- failure rate
- retry rate
- consensus stability
- agent effectiveness
- model effectiveness
- graph effectiveness

Evaluation results can inform routing and optimization.

They must not silently rewrite production behavior.

---

# 19. Prompt Registry and Optimization

Prompts should eventually become versioned assets.

Possible lifecycle:

```text
Prompt
 |
Version
 |
Evaluation
 |
Candidate
 |
Comparison
 |
Approval
 |
Production Version
```

Optimization must be controlled.

An AI may propose an improved prompt.

It must not automatically replace production instructions without validation and an explicit policy.

---

# 20. Memory Integration

The AI system should use existing persistent memory.

Examples:

```text
Agent execution
      |
      +--> relevant memory lookup
      |
      +--> task context
      |
      +--> execution
      |
      +--> result
      |
      +--> optional persistent learning
```

The memory system remains the existing T-Bit memory system.

AI modernization consumes and extends its AI-facing interfaces.

It does not require redesigning Q-Vault.

---

# 21. Tools

Existing AI tools should be reused and formalized where necessary.

Tools may include:

- memory operations
- index queries
- document search
- web research
- computation
- symbolic operations
- code analysis
- asset operations
- other existing T-Bit capabilities

Each tool must have:

- schema
- permissions
- validation
- execution boundary
- error contract
- provenance

---

# 22. Security

The AI layer must preserve and strengthen:

- permission enforcement
- tool authorization
- input validation
- output validation
- prompt injection defenses
- data isolation
- provider credential isolation
- secret handling
- audit logging
- execution limits
- agent permissions
- human approval for sensitive operations

AI agents must not automatically gain unrestricted access to T-Bit.

---

# 23. Observability and Lineage

Every complex AI execution should eventually be traceable.

A trace should identify:

```text
Request
 |
Task
 |
Graph
 |
Agent
 |
Model
 |
Prompt Version
 |
Tools
 |
Evidence
 |
Intermediate Results
 |
Verification
 |
Consensus
 |
Final Result
```

This enables debugging and evaluation.

---

# 24. Human Control

Autonomy must not eliminate user control.

The system should support human gates for operations such as:

- destructive actions
- high-impact changes
- production prompt changes
- configuration changes
- sensitive memory operations
- uncertain consensus
- low-confidence verification

---

# 25. UI Boundary

The existing T-Bit visual interface remains the user-facing visualization of persistent memory.

If AI execution controls are added, they should be implemented as normal UI panels or controls.

They must NOT be represented as part of the existing 2D/3D memory map.

No `AgentGraphMesh` should be added to the existing 3D memory scene.

No AI execution graph should replace the memory visualization.

---

# 26. Target AI Architecture

The conceptual target is:

```text
                         USER
                           |
                           v
                  REQUEST ANALYZER
                           |
                           v
                    TASK CLASSIFIER
                           |
                           v
                 CAPABILITY MATCHER
                           |
             +-------------+-------------+
             |                           |
             v                           v
        AGENT REGISTRY              MODEL ROUTER
             |                           |
             +-------------+-------------+
                           |
                           v
                    AGENT RUNTIME
                           |
                           v
                 GRAPH ENGINEERING
                           |
                           v
                    GRAPH EXECUTOR
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
       Agent A          Agent B          Agent C
          |                |                |
          +----------------+----------------+
                           |
                           v
                     EVIDENCE
                           |
                           v
                    VERIFICATION
                           |
                           v
                      CONSENSUS
                           |
                           v
                     SYNTHESIS
                           |
                           v
                     EVALUATION
                           |
                 +---------+---------+
                 |                   |
               DONE              REPLAN
                                     |
                                     v
                              LOOP ENGINE
                                     |
                                     +----> EXECUTOR
```

Existing T-Bit components remain underneath this layer:

```text
Existing Providers
Existing Tools
Existing Permissions
Existing Memory
Existing Indexes
Existing Document Processing
Existing Code Analysis
Existing T-Bit Runtime
```

---

# 27. Required Agent Set

The `.github/agents` directory must be audited first.

The actual list must be obtained from the repository.

Known intended roles include agents such as:

- AI System Engineer
- Backend Engineering
- Chief Architect
- Code Reviewer
- Consensus
- Database Integration
- DevOps
- Documentation
- Engineering Manager
- Performance
- Prompt
- Security Auditor
- Storage
- UI/UX Architect
- Validation
- Context Engineer
- Prompt Engineer

A missing **Graph Engineering Agent** must be designed and implemented.

The exact final agent set must be based on the actual repository files, not memory or assumptions.

---

# 28. Graph Engineering Agent

The Graph Engineering Agent is a new AI capability.

Its responsibilities may include:

- analyze tasks
- identify dependencies
- construct execution graphs
- validate graph topology
- identify missing dependencies
- identify redundant work
- recommend parallelization
- recommend sequencing
- select verification nodes
- define evidence requirements
- construct graph specifications
- analyze execution failures
- propose graph improvements

It must not control or modify the existing T-Bit memory visualization.

---

# 29. Proposed Repository Components

The following are conceptual components, not pre-approved filenames.

Before implementation, the repository must be inspected to determine where each capability belongs.

Potential components:

```text
AgentCore
AgentRegistry
AgentLoader
AgentRuntime
AgentContext
ModelRouter
TaskClassifier
CapabilityMatcher
GraphCore
GraphValidator
GraphExecutor
GraphEngineeringAgent
EvidenceEngine
VerificationEngine
ConsensusEngine
ArbitrationEngine
EvaluationEngine
LoopEngine
PromptRegistry
ExecutionTracer
LineageStore
```

Do not create all of these blindly.

Existing functionality must be reused wherever possible.

---

# 30. Ordered Implementation Roadmap

## Phase 0 — Forensic Baseline

Before changing code:

1. Read the complete T-Bit repository documentation.
2. Read every relevant document under `docs/`.
3. Read all AI/agent documentation.
4. Inventory `.github/agents`.
5. Inspect existing AI providers.
6. Inspect `TBitChatEngine`.
7. Inspect AI tools.
8. Inspect AI permissions.
9. Inspect memory interfaces.
10. Inspect query/index interfaces.
11. Inspect existing AI APIs.
12. Inspect existing frontend AI controls.
13. Establish actual dependency relationships.
14. Compare implementation against documentation.
15. Record contradictions.
16. Produce an evidence-based baseline.

No implementation begins before this baseline.

---

# Phase 1 — Agent Foundation

Implement the minimum runtime required to turn `.github/agents` into real agents.

Target capabilities:

- agent schema
- loader
- registry
- validation
- runtime
- context
- permissions
- provider integration
- execution lifecycle

Do not introduce Graph Engineering yet.

First make individual agents execute correctly.

---

# Phase 2 — Model Routing

Improve provider/model selection.

Reuse the existing provider system.

Implement:

- capability matching
- model requirements
- routing policy
- fallback
- timeout
- retry
- provider health
- local/cloud preference

Validate this independently.

---

# Phase 3 — Graph Engineering Foundation

Implement:

- graph contract
- graph nodes
- graph edges
- graph validation
- graph specification
- graph executor
- execution state

Implement the Graph Engineering Agent.

Keep the execution graph completely separate from the persistent-memory graph.

---

# Phase 4 — Multi-Agent Orchestration

Connect agents through execution graphs.

Support:

- sequential execution
- parallel execution
- fan-out
- fan-in
- reduction
- synthesis
- conditional routing
- retries
- verification nodes

Use simple tasks first.

---

# Phase 5 — Evidence, Verification and Consensus

Implement:

- claims
- evidence
- provenance
- contradiction detection
- verification
- dissent
- arbitration
- consensus

Consensus must be evidence-aware.

---

# Phase 6 — Context and Graph Prompting

Upgrade context construction.

Integrate:

- memory
- graph state
- evidence
- tool results
- previous node outputs
- agent role
- constraints

The prompt becomes a generated representation of structured execution state.

---

# Phase 7 — Evaluation

Create evaluation mechanisms for:

- agents
- models
- prompts
- graphs
- consensus
- tool execution
- final outputs

No optimization should occur without measurement.

---

# Phase 8 — Loop Engineering

Implement controlled recursive execution.

Support:

- evaluate
- retry
- replan
- improve
- terminate

All loops require explicit limits.

---

# Phase 9 — Prompt Engineering System

Implement:

- prompt registry
- versions
- evaluation
- candidate prompts
- approval
- rollback

Then integrate the Prompt Engineer agent.

---

# Phase 10 — Optimization

Use measured evaluation data to improve:

- model routing
- agent selection
- graph topology
- prompt versions
- context selection
- retry policies

Optimization must be controlled and reversible.

---

# Phase 11 — Advanced Autonomous Workflows

Only after the previous phases are stable:

- long-running workflows
- scheduled AI tasks
- adaptive routing
- recursive research
- self-evaluation
- controlled self-improvement
- advanced agent collaboration

Autonomy remains bounded by policy.

---

# 31. Validation Gates

Every phase must pass validation before the next phase begins.

Each phase requires:

```text
Implementation
    |
Unit Tests
    |
Integration Tests
    |
Regression Tests
    |
AI Evaluation
    |
Security Validation
    |
Documentation Update
    |
Phase Approval
```

No skipping phases because a future component appears attractive.

---

# 32. Required Evidence Standard

Every architectural claim must be classified as:

```text
VERIFIED
PARTIALLY VERIFIED
DOCUMENTED ONLY
INFERRED
UNKNOWN
CONTRADICTED
```

"Likely exists" is not sufficient.

If the source cannot prove a capability exists, it must not be classified as implemented.

If reports disagree and source inspection cannot resolve the disagreement:

```text
STATUS = UNKNOWN / MANUAL REVIEW REQUIRED
```

Do not invent a reconciliation.

---

# 33. Rules for Qwen Evaluation

Qwen must evaluate this blueprint against the actual T-Bit repository.

Qwen must:

1. Verify every claim against source code.
2. Identify any component that already exists.
3. Identify proposed components that duplicate existing functionality.
4. Identify proposed components that conflict with existing architecture.
5. Identify missing interfaces.
6. Identify incorrect assumptions.
7. Identify unnecessary rearchitecture.
8. Identify security risks.
9. Identify performance risks.
10. Identify implementation-order problems.
11. Identify dependencies between phases.
12. Identify missing validation gates.
13. Identify any requirement that is technically unrealistic.
14. Identify any requirement that requires additional repository evidence.

Qwen must NOT:

- invent files
- invent APIs
- invent implementations
- assume a feature exists because documentation mentions it
- assume a feature is missing because it was not found in a superficial search
- recommend storage migration without source evidence
- recommend Q-Vault rearchitecture as part of this project
- mix memory visualization with Graph Engineering
- treat `.github/agents` as already-connected runtime agents
- treat conceptual architecture as implemented architecture

---

# 34. Required Qwen Output

Qwen should return:

## A. Validation

For each major section:

```text
VALID
PARTIALLY VALID
INVALID
REQUIRES SOURCE VERIFICATION
```

with evidence.

## B. Corrections

List every statement that must be corrected.

## C. Existing Components

Map proposed capabilities to existing T-Bit components.

## D. Missing Components

Identify what genuinely does not exist.

## E. Duplication Risks

Identify proposed components that duplicate existing functionality.

## F. Architecture Risks

Identify architectural conflicts.

## G. Corrected Architecture

Provide the architecture Qwen considers technically justified after repository verification.

## H. Corrected Roadmap

Provide a corrected sequential roadmap.

## I. Dependency Graph

Show which implementation phases depend on which previous phases.

## J. Stop Conditions

Identify conditions under which implementation must stop and require human architectural review.

---

# 35. Final Architectural Objective

The final objective is not to make T-Bit larger.

The objective is to make T-Bit **more capable, more intelligent, more reliable, more verifiable, more modular and more autonomous while preserving the functionality that already works**.

The desired evolution is:

```text
CURRENT T-BIT

Persistent Memory
+
Multi-Provider AI
+
Tools
+
Single/limited orchestration
        |
        v

TARGET T-BIT

Persistent Memory
+
Multi-Provider AI
+
Executable Agents
+
Model Routing
+
Graph Engineering
+
Graph Prompting
+
Multi-Agent Execution
+
Evidence
+
Verification
+
Consensus
+
Evaluation
+
Controlled Loops
+
Prompt Optimization
+
Lineage
+
Bounded Autonomy
```

The existing Q-Vault and memory visualization remain the foundation.

The AI system becomes the new advanced cognitive layer above that foundation.

---

# 36. Core Rule

**Do not rebuild what already works.**

**Do not modify what is explicitly out of scope.**

**Do not implement architecture from assumptions.**

**Do not confuse conceptual diagrams with implementation.**

**Do not confuse the persistent-memory graph with AI execution graphs.**

**Do not introduce a new runtime when an existing runtime can be extended.**

**Do not introduce autonomous behavior without evaluation, limits and observability.**

**Do not proceed from one phase until the previous phase is verified.**

The repository is the source of truth.

Source-code evidence overrides previous reports.

Previous reports are hypotheses until verified.

This blueprint is a target architecture and implementation plan, not evidence that any proposed component already exists.
