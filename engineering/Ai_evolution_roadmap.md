# T-BIT 2.0 — AI SYSTEM EVOLUTION ROADMAP

## 1. PURPOSE

Evolve the existing T-Bit AI subsystem into a modern multi-agent, multi-model, graph-oriented AI execution system.

The existing T-Bit application is functional.

The objective is NOT to rewrite T-Bit.

The objective is to improve, extend, and operationalize its existing AI capabilities while preserving all existing functionality.

---

# 2. ABSOLUTE ARCHITECTURAL BOUNDARIES

The following components are OUT OF SCOPE and MUST NOT be modified as part of this initiative:

- Q-Vault
- T-Bit persistent storage architecture
- `.tbit` storage format
- `TBitFileSystem.ts`
- `TBitStorageService.ts`
- AllocationMap
- Existing 2D memory visualization
- Existing 3D memory visualization
- `VoidScene`
- `OriginSingularity`
- `VitInstanceCloud`
- `QuantumRay`
- `WikiLinksMesh`
- Existing MemoryGraph visualization
- Existing spatial visualization logic

The existing 2D/3D maps represent persistent user memory and stored information.

They are NOT the Graph Engineering execution graph.

Do not merge these concepts.

---

# 3. EXISTING AI SYSTEM

Before modifying anything, inspect and document the current implementation.

Relevant areas include:

- `AiProvider.ts`
- `AiProviderFactory.ts`
- `TBitAiBridge.ts`
- `TBitChatEngine.ts`
- `TBitLocalToolExecutor.ts`
- `aiPermissions.ts`
- existing provider adapters
- existing AI tools
- existing agent definitions
- existing context handling
- existing prompting
- existing memory integration
- existing tests

The current AI system must remain functional throughout the evolution.

---

# 4. EXISTING AGENTS

The `.github/agents/` directory contains agent definitions copied manually from AIOS.

These files are currently declarative definitions.

They must NOT be assumed to be executable agents merely because their `.agent.md` files exist.

First inspect every existing agent.

Important distinction:

```text
.agent.md
    ↓
Agent Definition
    ↓
Agent Loader
    ↓
Agent Registry
    ↓
Agent Runtime
    ↓
Model
    ↓
Tools
    ↓
Execution

The runtime does not currently exist merely because the definitions exist.

Verify the actual implementation before making any claim.

---

# 5. CONTEXT ENGINEER

ContextEngineer.agent.md already exists.

Do NOT create a duplicate Context Engineer.

Do NOT replace it.

Use the existing definition as the authoritative project agent definition unless repository evidence shows otherwise.

---

# 6. GRAPH ENGINEERING AGENT

GraphEngineeringAgent.agent.md already exists

Do NOT create a duplicate Graph Engineering Agent.

Do NOT replace it.

Use the existing definition as the authoritative project agent definition unless repository evidence shows otherwise.

Graph Engineering is a computational orchestration discipline.

It is NOT:

    MemoryGraph
    Q-Vault visualization
    2D map
    3D map
    spatial memory visualization

Graph Engineering concerns:

    task decomposition
    execution topology
    node contracts
    dependency graphs
    real dependencies
    fake-edge detection
    parallel execution
    fan-out
    fan-in
    verification
    synthesis
    loops
    termination
    agent orchestration
    model routing
    execution optimization

---

# 7. DOCUMENTATION RULE

The canonical technical documentation is:

docs/T-BIT_BOOK.md

This filename and path MUST be preserved.

Every implemented change to the application MUST eventually be documented there.

The documentation sequence is:

Analyze
↓
Design
↓
Implement
↓
Test
↓
Validate
↓
Update docs/T-BIT_BOOK.md
↓
Verify documentation against implementation

Never document an unimplemented feature as implemented.

---

# 8. PHASE 0 — BASELINE

Before implementation:

    1. Read the repository structure.
    2. Read the relevant documentation.
    3. Inspect the current AI architecture.
    4. Inspect all .github/agents/*.agent.md files.
    5. Identify existing AI providers.
    6. Identify existing tools.
    7. Identify current AI execution flow.
    8. Identify existing tests.
    9. Run the existing test suite.
    10. Run the existing build/type checks.
    11. Record failures that existed before this work.

Do not fix unrelated pre-existing problems during this phase.

Create a baseline report:

engineering/reports/AI-EVOLUTION-BASELINE.md

The report must distinguish:

    verified implementation;
    partial implementation;
    documentation only;
    missing capability;
    pre-existing failure;
    new failure.

---

# 9. PHASE 1 — AGENT DEFINITION VALIDATION

Inventory all existing .github/agents/*.agent.md.

For every agent determine:

    name
    role
    capabilities
    tools
    expected inputs
    expected outputs
    dependencies
    model requirements if declared
    permissions if declared
    current runtime integration
    whether it is executable or declarative only

Do not invent missing fields.

Produce:

engineering/reports/AGENT-INVENTORY.md

Then validate the new:

GraphEngineeringAgent.agent.md

against the established agent format.

---

# 10. PHASE 2 — AGENT LOADING

Design and implement the minimum infrastructure required to load agent definitions.

Expected conceptual architecture:

.agent.md files
      ↓
AgentSpecLoader
      ↓
AgentSpec
      ↓
AgentRegistry

Do not implement a second AI provider architecture.

Do not duplicate existing provider abstractions.

Reuse the existing AI provider system.

The loader must parse actual repository definitions.

Malformed agent definitions must fail explicitly.

---

# 11. PHASE 3 — AGENT RUNTIME

Create the smallest possible runtime capable of executing one real agent.

Conceptual flow:

User / System Task
        ↓
Agent Registry
        ↓
Agent Specification
        ↓
Context
        ↓
Prompt / Instructions
        ↓
Existing AI Provider
        ↓
Model
        ↓
Tools
        ↓
Result

The existing direct AI path must remain available.

Introduce a controlled execution mode:

    OFF
    SHADOW
    ON

OFF

    Existing AI path operates normally.

SHADOW

    The agent system executes for evaluation but does not replace the production result.

ON

    The agent system becomes the active execution path for the supported scenario.

Do not remove the existing path until parity has been demonstrated.

--- 

# 12. PHASE 4 — FIRST REAL AGENT

Before implementing Graph Execution, execute ONE existing agent end-to-end.

Select the most appropriate existing agent based on repository evidence.

Do not choose arbitrarily.

Demonstrate:

Agent Definition
      ↓
Loader
      ↓
Registry
      ↓
Context
      ↓
Prompt
      ↓
Existing Model Provider
      ↓
Tool Execution
      ↓
Agent Result

Add tests.

The objective is architectural validation.

Do not implement the entire multi-agent system before proving this path.

--- 

# 13. PHASE 5 — AGENT PERMISSIONS AND POLICY

Integrate agent execution with the existing permission architecture.

Do not create a parallel permission system unless the current architecture demonstrably cannot support agent permissions.

The system must distinguish:

    read
    write
    delete
    search
    compute
    external/web operations

Agent capabilities must not automatically imply permission to perform every tool.

---

# 14. PHASE 6 — GRAPH ENGINEERING CORE

Only after the single-agent runtime is validated should Graph Engineering implementation begin.

The Graph Engineering runtime must conceptually support:

Graph
 ├── Nodes
 ├── Edges
 ├── Contracts
 ├── Dependencies
 ├── Execution State
 └── Termination Conditions

Potential components:

    graphCore.ts
    GraphExecutor.ts
    agentCore.ts
    AgentRegistry.ts
    ModelRouter.ts
    graphEngineeringAgent.ts

However:

DO NOT create these files automatically.

First inspect the repository and determine whether equivalent functionality already exists.

Reuse existing abstractions whenever possible.

---

# 15. GRAPH NODE CONTRACT

Every executable graph node must define:

    identity
    purpose
    input contract
    output contract
    responsible agent or execution component
    model requirement when applicable
    tools required
    dependencies
    timeout/budget
    retry policy
    verification requirement
    failure behavior

Do not allow ambiguous nodes.

---

# 16. EDGE VALIDATION

Every graph edge must represent a real dependency.

Apply this test:

    If node A did not execute, could node B still execute correctly without A's output?

If yes, the edge may be unnecessary.

The system should detect and report artificial dependencies.

Independent nodes should be eligible for parallel execution.

---

# 17. GRAPH EXECUTION

Where supported by the runtime, implement:

Fan-Out
   ↓
Independent Agents
   ↓
Verification
   ↓
Fan-In
   ↓
Synthesis

Possible execution patterns:

    sequential
    parallel
    fan-out/fan-in
    verification
    consensus
    bounded loop
    retry
    human approval where explicitly required

Do not implement unlimited loops.

Every loop requires:

    termination condition
    maximum iterations
    failure condition
    resource budget

---

# 18. MODEL ROUTING

Reuse the existing provider infrastructure.

Do not create a second provider factory.

Model routing should eventually consider:

    task type
    reasoning requirements
    tool requirements
    latency
    context requirements
    cost
    model availability
    reliability

Do not invent model capabilities.

Verify actual configured providers and models.

---

# 19. CONSENSUS

Consensus and Graph Engineering are related but distinct.

Graph Engineering determines:

    WHEN
    WHERE
    HOW

multiple agents participate.

Consensus determines:

    HOW
    independent results
    are evaluated and consolidated

Do not merge the two into one component.

Reuse the existing Consensus Agent definition and infrastructure where available.

---

# 20. CONTEXT ENGINEERING

Context Engineering is separate from Graph Engineering.

Context Engineering determines what information an agent receives.

Graph Engineering determines where that agent executes in the workflow.

Use the existing Context Engineer.

Do not create a second Context Engineer.

---

# 21. PROMPT ENGINEERING

Prompt Engineering remains responsible for model instructions.

Graph Engineering determines when a prompt-driven execution node is required.

Do not replace Prompt Engineering with Graph Engineering.

The two systems are complementary.

---

# 22. VALIDATION

Every phase must have measurable validation.

Minimum validation categories:

Agent

    definition loading
    registry
    execution
    tool access
    permissions
    model invocation
    failure handling

Graph

    node validation
    edge validation
    dependency detection
    fake-edge detection
    parallel execution
    fan-out
    fan-in
    verification
    synthesis
    loop termination

AI

    provider compatibility
    model selection
    context handling
    prompt handling
    tool execution
    fallback
    regression

Security

    permissions
    secret handling
    tool authorization
    untrusted input
    prompt injection boundaries
    model output handling

---

# 23. REGRESSION REQUIREMENT

The current T-Bit AI functionality must continue working.

Before every architectural milestone:

Existing Tests
+
New Tests

must pass, except for explicitly documented pre-existing failures.

Do not silently change existing behavior.

If behavior must change, document:

    previous behavior;
    reason;
    new behavior;
    compatibility impact;
    migration requirement.

---

# 24. DOCUMENTATION REQUIREMENT

After each validated implementation milestone:

Update:

docs/T-BIT_BOOK.md

Document:

    what was implemented;
    architecture;
    components;
    execution flow;
    agent behavior;
    graph behavior;
    model interaction;
    security implications;
    configuration;
    tests;
    limitations;
    known risks.

Do not copy planned architecture into the book as if it were implemented.

---

# 25. ARCHITECTURAL SAFETY

Before modifying any existing component, answer:

1. Is it inside the AI scope?
2. Is it required for the current phase?
3. Does an equivalent implementation already exist?
4. Can the existing implementation be extended?
5. Will the modification alter persistent memory?
6. Will it alter Q-Vault?
7. Will it alter 2D/3D visualization?
8. Will it alter existing AI behavior?
9. Is there a regression test?
10. Is the modification documented?

If any answer is unclear:

STOP and inspect the repository before coding.

---

# 26. ANTI-HALLUCINATION RULES

Never:

invent files;
invent APIs;
invent agents;
invent models;
invent providers;
invent tools;
invent dependencies;
assume documentation equals implementation;
assume an .agent.md is executable;
assume a graph runtime exists;
assume consensus exists because an agent definition exists;
assume Graph Engineering is implemented because graph-related structures exist;
modify unrelated architecture to make a theoretical design easier.

Every claim must be supported by repository evidence.

When evidence is insufficient:

UNKNOWN — REQUIRES VERIFICATION

Do not guess.

---

# 27. CHANGE CONTROL

For every implementation step produce:

CHANGE
WHY
FILES
IMPLEMENTATION
TESTS
RESULT
DOCUMENTATION

Do not perform large uncontrolled batches of modifications.

Prefer small, verifiable increments.

---

# 28. REQUIRED FINAL OUTPUT OF EACH PHASE

At the end of each phase provide:

Implemented

    Verified changes.

Not Implemented

    Requested capabilities that remain pending.

Tests

    Exact test results.

Existing Failures

    Failures unrelated to the current change.

Risks

    New or changed risks.

Documentation

    Exact sections updated in:

    docs/T-BIT_BOOK.md

Next Phase

    Only the next approved phase.

    Do not skip phases.

---

# 29. FIRST EXECUTION INSTRUCTION

Start with PHASE 0.

Do not implement code yet.

First inspect the repository and documentation.

Read the relevant documentation completely.

Inspect the existing AI architecture and all agent definitions.

Establish the factual baseline.

Then produce:

    engineering/reports/AI-EVOLUTION-BASELINE.md

Only after the baseline is complete and verified may PHASE 1 begin.

---

# 30. FINAL PRINCIPLE

The goal is not to replace T-Bit.

The goal is to evolve its existing AI architecture into a more capable:

multi-agent;
multi-model;
tool-aware;
context-aware;
graph-oriented;
verifiable;
secure;
observable;
optimized

AI execution system.

Preserve what already works.

Extend only where evidence supports the change.

Implement incrementally.

Validate continuously.

Document every validated change.

Never confuse architectural ambition with implemented functionality.

---
