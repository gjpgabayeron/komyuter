# Comprehensive Critique of the Komyuter Thesis Manuscript (Chapters 1-3)

## Executive Summary

This thesis presents a well-conceived and timely project addressing a genuine gap in Philippine urban mobility. The integration of multi-criteria Dijkstra pathfinding with AR wayfinding for jeepney navigation in Iloilo City is innovative and practically valuable. However, the manuscript requires substantial strengthening in technical depth, methodological rigor, and academic positioning before proceeding to implementation and evaluation.

---

## 1. Software Developer Perspective

### 1.1 Architecture Assessment

**Strengths:**

- The Turborepo monorepo structure with pnpm workspaces is appropriate for maintaining type consistency across three applications
- The route-expanded graph model (`stop_{stopId}_route_{routeId}`) correctly addresses the multi-route transfer problem
- The Stale-While-Revalidate caching pattern for graph updates is a pragmatic solution to the update latency problem
- PostGIS integration for spatial queries is well-justified

**Critical Weaknesses:**

**1.1.1 Node.js for Graph Computation**
The manuscript proposes using Node.js Worker Threads for graph reconstruction from PostGIS. This is a significant architectural risk. Node.js is single-threaded and poorly suited for CPU-intensive graph operations, especially when handling 10-12 routes with potentially hundreds of stops and thousands of transfer edges.

**Recommendation:**

- Implement graph construction as a separate microservice in a language better suited for computational work (Rust, Go, or even Python with NumPy)
- Alternatively, leverage PostgreSQL's pgRouting extension to offload pathfinding to the database layer, which would eliminate the need to materialize the graph in Redis entirely

**1.1.2 Redis Caching Strategy**
The manuscript mentions caching the serialized transit graph in Redis but doesn't specify:

- Serialization format (JSON, MessagePack, Protocol Buffers)
- Cache invalidation granularity (full rebuild vs. incremental updates)
- Memory limits and eviction policies

**Recommendation:**

- Use MessagePack or CBOR for serialization to reduce memory footprint
- Implement incremental graph updates for single-route changes rather than full rebuilds
- Add Redis memory monitoring and alerting

**1.1.3 Mobile App Architecture**

```
AR Module: expo-camera + expo-sensors
Map: @rnmapbox/maps
State: React Context/Redux (unspecified)
```

The AR implementation using expo-camera and raw sensor fusion without ARCore/ARKit is:

- **Correct decision** for avoiding vendor lock-in
- **Risky** because sensor fusion for stable AR markers requires sophisticated filtering

**Recommendation:**

- Document the exact sensor fusion algorithm (Madgwick/Mahony filter for orientation, Kalman filter for position)
- Consider using `expo-sensors` with `react-native-reanimated` for frame-synchronous updates
- Add fallback behavior when sensor data quality degrades

**1.1.4 Data Layer Concerns**

The manuscript mentions:

- `is_detour_only` flag for detour stops
- `is_guaranteed_service` for formal vs. hail-and-ride stops
- `restricted_segments` for no-boarding zones

These are well-designed but the complexity of handling detours deserves more attention. The manuscript says detours are "injected as temporary nodes and edges only when a navigation request includes a detour-flagged destination." This suggests detours are destinations only, but the LPTRP likely includes detour-only _segments_ that should be considered during routing.

**Recommendation:**

- Clarify whether detours can appear in the middle of a route (as segments) or only as endpoints
- Consider modeling detours as alternative route variants with their own edge weights

### 1.2 Algorithm Implementation

**1.2.1 Multi-Criteria Dijkstra Implementation**

The scalarized approach with fixed weights per preference profile is:

- **Theoretically sound** for single-objective optimization
- **Limited** because it cannot find Pareto-optimal tradeoffs

**Critical Issue:** The normalization formula `norm(x) = (x - min) / (max - min)` requires global min and max across all edges. This means:

- Every edge weight update requires recomputing global min/max
- The normalized weights change when routes are added/removed
- The preference profile weights are not directly interpretable

**Recommendation:**

- Use rank-based normalization instead of min-max: assign normalized scores based on percentile ranks
- Alternatively, use z-score normalization with rolling statistics
- Consider implementing a Pareto-frontier approach as a "what-if" comparison feature

**1.2.2 Modified Hausdorff Distance for Trust Scoring**

The MHD implementation with a 100-meter normalization threshold is:

- **Appropriate** for the stated purpose
- **Under-specified** in implementation details

Missing details:

- How are GPS traces matched to routes when a route has multiple variants?
- What is the minimum trace length required for a valid trust score?
- How is temporal decay handled for trust scores?

**Recommendation:**

- Require at least 10 GPS points and 500 meters of travel for a valid trace
- Implement exponential decay: `score = 0.7 × old_score + 0.3 × new_match`
- Add route variant matching using the route_id or closest polyline

### 1.3 Scalability Assessment

The system as described would scale to:

- **Routes**: The 10-12 route target is feasible; 25 routes (full LPTRP) would require performance testing
- **Users**: The Redis caching and stateless API design support horizontal scaling
- **AR Module**: Bottleneck is device-side, not server-side

**Scaling Concerns:**

1. Graph rebuild time with 25 routes and all transfer edges may exceed acceptable limits
2. PostGIS `ST_DWithin` queries for transfer edge generation may become expensive at scale

**Recommendation:**

- Add transfer edge pre-generation using spatial indexing
- Consider using a hexagonal grid or geohash for spatial clustering
- Document expected graph size (nodes, edges) and rebuild time targets

---

## 2. Researcher Perspective

### 2.1 Problem Statement Assessment

**Strengths:**

- Clear articulation of the data gap (no GTFS for Iloilo City)
- Strong justification using LTFRB/LPTRP documentation
- Effective use of statistics (80% urban trips via PUJ, 117 hours annual loss)
- The "oral tradition" framing is rhetorically effective

**Weaknesses:**

**2.1.1 Missing Stakeholder Analysis**

The manuscript positions the problem as purely technical, ignoring:

- **Jeepney drivers and operators**: How does Komyuter affect their operations?
- **LTFRB**: Does digitizing routes help or hinder franchise enforcement?
- **City government**: Is there a plan for maintenance after the study ends?

**Recommendation:**

- Add a "Stakeholder Impact Analysis" section before the Significance
- Acknowledge that Komyuter may increase demand on certain routes
- Address data ownership and sustainability

**2.1.2 Under-theorized "Smart Mobility" Framing**

The literature review mentions "smart mobility" but doesn't engage with:

- Critical perspectives on smart city technologies (e.g., Morozov's "techno-solutionism")
- The digital divide: who gets left out when navigation goes digital?
- Equity implications of optimizing for distance/fare vs. accessibility

**Recommendation:**

- Add a brief critical discussion in the literature review
- Acknowledge that AR wayfinding assumes smartphone ownership
- Consider adding accessibility features for elderly or disabled users

### 2.2 Literature Review Gaps

**Critical Missing References:**

1. **Philippine Transit Studies**: The SafeTravelPH and PIDS references are excellent, but missing:
   - The Department of Transportation's PUV Modernization Program literature
   - Studies on the social impact of jeepney phaseout
   - Local Iloilo City transportation studies (e.g., from UP Visayas)

2. **AR Navigation Literature**: The Rehman & Cao (2016) reference is good, but missing:
   - More recent AR navigation studies (2020-2025)
   - Studies specifically on AR for public transit wayfinding
   - User acceptance of AR in outdoor environments

3. **Multi-Criteria Routing**: The literature review on multi-criteria routing is thin:
   - Only one reference (Delling et al., 2014) on RAPTOR
   - No discussion of alternative approaches (A* with multiple heuristics, label-setting algorithms)
   - No comparison of scalarization vs. Pareto approaches

4. **Trust and Verification Systems**: The trust scoring feature is mentioned but:
   - No literature on user trust in navigation systems
   - No discussion of gamification or incentive structures for GPS trace submission
   - Missing references on community-sourced transit data (e.g., OpenStreetMap, Transitland)

**Recommendation:**

- Add at least 5-8 more references across these categories
- Consider a "Theoretical Framework" section that integrates concepts from:
  - Multi-criteria decision analysis
  - Spatial cognition and wayfinding theory
  - Human-Computer Interaction (for AR interface design)

### 2.3 Methodology Concerns

**2.3.1 Requirement Analysis**

The Functional Requirements Traceability Matrix (Table II) is good but:

- Missing a "Priority" column for non-functional requirements
- No traceability from requirements to testing strategy
- FR-17 through FR-19 marked as "bonus" but affect the trust scoring architecture

**Recommendation:**

- Add a column for "Verification Method" (Unit Test, Integration Test, User Test)
- Clearly separate must-have from nice-to-have requirements
- Add non-functional requirements: "The system must maintain a 99.5% uptime for critical pathfinding endpoints"

**2.3.2 Usability Evaluation Design**

The PSSUQ evaluation with 25-30 respondents is appropriate, but the sampling strategy has issues:

**Sampling Concerns:**

- **Students (10-12)**: Purposive sampling from a single university may not represent all students (e.g., different campuses, colleges)
- **Working professionals (8-10)**: No specification of industry/occupation diversity
- **Tourists (5-8)**: Convenience sampling at transport hubs may overrepresent certain types of tourists

**Task Scenario Issues:**

- **Task 2**: "Identify the total fare and number of transfers" - This tests information retrieval, not navigation competence
- **Task 3**: "Switch to Cheapest profile and note the difference" - This is trivial and doesn't test pathfinding quality
- **Tasks 4-5**: AR tasks have a 3-minute time limit - is this sufficient for first-time users?

**Recommendation:**

- Include a "prior experience" survey to control for confounds
- Replace Task 3 with "Find the optimal route from Location X to Location Y using the Balanced profile, then justify why it's better than other options"
- Increase AR task time limits to 5 minutes and measure completion rate
- Add a post-task NASA-TLX workload assessment for AR tasks

**2.3.3 Data Collection for Routes**

The manuscript states: "Route coverage is restricted to 10 to 12 of the 25 rationalized LPTRP routes due to the manual effort required for geospatial data collection."

This is a **significant limitation** that undermines the claim of providing "public transit navigation for Iloilo City." A navigation system that covers less than half the authorized routes is not a complete solution.

**Recommendation:**

- **Short-term**: Be transparent about this limitation in the Scope and Delimitations
- **Medium-term**: Consider using OpenStreetMap or volunteered data to bootstrap route data for all 25 routes
- **Long-term**: Propose a framework for crowdsourced route verification that could expand coverage after deployment

### 2.4 Alignment Between Objectives and Solutions

**Objective 1**: "Develop a geospatial route and fare management system"
**Solution**: Admin dashboard with PostGIS
**Assessment**: Well-aligned

**Objective 2**: "Implement a multi-criteria Dijkstra's pathfinding engine"
**Solution**: Weighted graph with four criteria
**Assessment**: Aligned but the scalarization approach should be justified more thoroughly

**Objective 3**: "Design and integrate AR wayfinding"
**Solution**: Location-based Geo-AR with sensor fusion
**Assessment**: Aligned but technical implementation details are incomplete

**Objective 4**: "Evaluate usability using PSSUQ"
**Solution**: 16-item questionnaire with three subscales
**Assessment**: Aligned but sample size justification is weak (no power analysis)

---

## 3. Data Scientist Perspective

### 3.1 Data Model Assessment

**3.1.1 Spatial Data Quality**

The manuscript assumes that GPS traces from smartphones are a valid source of ground truth data. This assumption requires more careful treatment.

**Issues:**

1. **GPS Bias**: Smartphone GPS in urban canyons exhibits systematic bias (e.g., multipath errors causing 10-30 meter offsets)
2. **Trace Alignment**: A single GPS trace does not validate a route; route validation requires multiple traces
3. **Transfer Edge Validation**: How do you validate that two stops are within 300 walking distance?

**Recommendation:**

- Use 5-10 traces per route segment for validation, not just one
- Add a confidence interval around GPS positions (e.g., 95% confidence ellipse)
- Consider using `ST_LineInterpolatePoint` to sample the route at regular intervals for validation

**3.1.2 Fare Data Structure**

The fare computation formula is:

```
fare = base_fare + max(0, dist_km - base_dist_km) × rate_per_km
```

The manuscript states: "Fares are calculated based on the total distance traveled per vehicle ride rather than independently for each route segment."

**Issue**: If a route has multiple segments (e.g., route A from Stop 1 to Stop 10), the fare should be based on the _total distance along the route_, not the straight-line distance. Is this accounted for?

**Recommendation**:

- Clarify whether distance is measured along the route polyline or as straight-line distance
- Add an "effective distance" field that accounts for route curves and detours

### 3.2 Algorithmic Concerns

**3.2.1 Multi-Criteria Weight Selection**

The weight vectors in Table IV are:

```
Shortest:    [0.50, 0.15, 0.20, 0.15]
Cheapest:    [0.15, 0.50, 0.20, 0.15]
Least Transfers: [0.15, 0.15, 0.55, 0.15]
Balanced:    [0.25, 0.25, 0.25, 0.25]
```

**Issue**: These weights appear arbitrary. There is no justification for:

- Why `0.50` for distance in the Shortest profile?
- Why `0.55` for transfers in Least Transfers?
- Why all `0.25` for Balanced? Is that really balanced, or just equal?

**Recommendation:**

- Conduct a small user study to determine desired tradeoffs
- Use Analytic Hierarchy Process (AHP) or conjoint analysis to derive weights empirically
- Consider adaptive weights: "If the user is a student, weight fare more heavily; if a tourist, weight distance"

**3.2.2 Normalization Strategy**

The min-max normalization approach is suspect because:

- The global min and max can change with route updates
- Outliers can skew the normalization
- Normalization by route profile would be more robust

**Alternative**: Use rank-based normalization:

```
norm(x) = (rank(x) - 1) / (n_edges - 1)
```

This ensures even distribution across [0, 1] and is robust to outliers.

**3.2.3 Multi-Criteria Optimality**

The scalarized approach with linear weights has a known limitation: it cannot find Pareto-optimal solutions that are non-convex combinations of criteria. This is unlikely to matter for the four criteria used, but should be acknowledged.

**Recommendation**: Add a brief discussion of Pareto optimality and why scalarization is acceptable for this application.

### 3.3 Trust Scoring: Statistical Validity

The Modified Hausdorff Distance for trust scoring is a reasonable approach, but the statistical validation is weak.

**Statistical Issues:**

1. **Sample Size**: How many traces are needed for a stable trust score?
2. **Spatial Bias**: Are GPS traces more accurate in some areas than others?
3. **Temporal Bias**: Does route validity change over time (e.g., due to construction, driver behavior)?

**Recommendation:**

- Use bootstrap resampling to estimate confidence intervals for trust scores
- Weight more recent traces higher (exponential decay)
- Stratify trust scores by time of day and day of week

### 3.4 Evaluation Metrics

The evaluation plan focuses on usability (PSSUQ) but lacks algorithmic performance metrics.

**Missing Metrics:**

1. **Pathfinding Accuracy**: How often does Komyuter find a route when one exists?
2. **Pathfinding Optimality**: How close is the found route to the true optimal?
3. **Performance Variation**: Does computation time vary significantly by route type?
4. **AR Marker Precision**: What is the angular error of AR markers at 50 meters?

**Recommendation:**

- Add "Algorithm Benchmarking" section with specific targets:
  - Pathfinding success rate: ≥95%
  - AR marker angular error: ≤5° at 50 meters
  - Fare accuracy: ≤₱1.00 error 95% of the time
  - Computation time: ≤500ms for 90% of queries

---

## 4. Technical Documentation Gaps

### 4.1 Underspecified Technical Details

1. **Sensor Fusion Algorithm**: The AR module uses "sensor smoothing" but doesn't specify:
   - The filter type (Kalman, complementary, moving average)
   - The exact low-pass filter parameters (α value)
   - How the magnetometer heading is calibrated

2. **GPS Snapping**: "25-50 meter snapping tolerance" - is this configurable?
   - What happens if a user is between two routes?
   - How are ambiguous snaps resolved?

3. **Transfer Edge Generation**: "Stops within 300-meter walkable radius"
   - Are pedestrian paths considered, or just Euclidean distance?
   - How is "walkable" determined (road network, sidewalks)?

4. **Offline Capability**: The manuscript mentions `expo-sqlite` for offline GPS trace caching.
   - What happens when offline?
   - Can navigation work offline?

### 4.2 Missing Error Handling

1. **GPS Signal Loss**: What happens if GPS is lost during AR navigation?
2. **Server Unavailability**: Can the app function offline?
3. **Route Not Found**: How does the UI communicate "no route available"?
4. **Sensor Calibration**: What guidance does the app provide for sensor calibration?

### 4.3 Missing Security Considerations

1. **Data Privacy**: Who owns the GPS trace data?
2. **Authentication**: JWT is mentioned but:
   - How are tokens refreshed?
   - What is the expiration policy?
3. **Rate Limiting**: How does the API handle excessive requests?

---

## 5. Recommended Revisions

### 5.1 Structural Revisions

1. **Chapter 2 (Literature Review)**:
   - Add a "Theoretical Framework" section
   - Expand AR navigation literature (2018-2025)
   - Add a subsection on "Smart Mobility in the Philippines"
   - Include critical perspectives on technology adoption

2. **Chapter 3 (Methodology)**:
   - Move algorithm specifications to an "Algorithm Design" section
   - Add a "Data Quality Assurance" subsection
   - Expand the PSSUQ analysis plan with statistical tests
   - Add a "Pilot Testing" subsection before full deployment

3. **Appendices**:
   - **Appendix A**: Full PSSUQ instrument
   - **Appendix B**: Sample route and stop data (GeoJSON format)
   - **Appendix C**: Algorithm pseudocode for Dijkstra's pathfinding
   - **Appendix D**: Sensor fusion algorithm details

### 5.2 Content Additions

1. **Sustainability Plan**: How will the system be maintained after the study?
   - Who will update fare data when LTFRB changes rates?
   - Who will add new routes?
   - Is there a budget for hosting?

2. **Ethical Considerations**:
   - Data privacy for GPS traces
   - Informed consent for usability study
   - Transparency about route coverage limitations

3. **Limitations Section Expansion**:
   - Android-only testing
   - Route coverage (10-12 of 25 routes)
   - Manual data collection
   - No real-time vehicle tracking

### 5.3 Data Science Improvements

1. **A/B Testing for Routing Profiles**: Compare user satisfaction across profiles
2. **Route Validation Framework**: Use bootstrapping to validate route data quality
3. **Predictive Features**:
   - Predicting route popularity from GPS trace density
   - Estimating bus arrival times from trace patterns

---

## 6. Strengths to Preserve

1. **Problem Framing**: The "oral tradition" metaphor is excellent
2. **Route-Expanded Graph**: Correct technical approach to multi-route modeling
3. **PostGIS Integration**: Appropriate spatial data solution
4. **PSSUQ Evaluation**: Standardized instrument with established benchmarks
5. **Trust Scoring Innovation**: Community validation is a novel contribution
6. **Incremental Development Model**: Reduces risk in AR implementation

---

## 7. Summary of Actionable Recommendations

### Priority 1: Critical Issues (Must Fix)

1. **Node.js Graph Computation**: Move to Rust/Go microservice or pgRouting
2. **Normalization Strategy**: Replace min-max with rank-based or z-score
3. **Weight Justification**: Add empirical basis for preference profile weights
4. **Sampling Plan**: Include power analysis for PSSUQ sample size
5. **Route Coverage**: Acknowledge the 10-12 route limitation throughout

### Priority 2: Important Improvements

6. **Literature Review**: Add critical perspectives, recent AR studies, route validation literature
7. **Algorithm Documentation**: Add pseudocode, complexity analysis, normalization details
8. **AR Sensor Fusion**: Document specific filters and parameters
9. **Trust Scoring**: Add statistical validation plan
10. **Ethics Section**: Add data privacy, informed consent, transparency

### Priority 3: Desirable Enhancements

11. **Sustainability Plan**: Data ownership, hosting, update processes
12. **Stakeholder Analysis**: Driver, operator, and government perspectives
13. **Offline Support**: Expand offline navigation capabilities
14. **Error Handling**: Document all error states and recovery strategies
15. **Security**: Add rate limiting, token refresh, data encryption

---

## 8. Conclusion

The Komyuter thesis addresses a genuine and significant gap in Philippine urban mobility. The integration of multi-criteria routing with AR wayfinding is innovative and practically valuable. The technical architecture is largely appropriate, but requires more detail on implementation specifics, particularly around graph computation, sensor fusion, and scalability.

The methodological approach is sound overall, with the PSSUQ evaluation providing a standardized benchmark. However, the sampling strategy could be strengthened with a power analysis, and the task scenarios could better test the system's core functionalities.

The data science components—particularly the trust scoring and multi-criteria optimization—have been thoughtfully designed but require more rigorous statistical validation and justification for key parameters.

With revisions addressing the priority 1 and 2 recommendations, this thesis has strong potential to make a substantive contribution to both the academic literature on transit routing and the practical challenge of public transit navigation in Philippine secondary cities.
