document.addEventListener('DOMContentLoaded', async () => {
    console.log("Arctic Visualization Script Loaded");

    // --- Configuration Variables ---
    // These are the main variables you will update based on your image and SVG path.

    const IMAGE_SETTINGS = {
        width: 1888,
        height: 2560 
    };

    // IMPORTANT: For temperature overlay to align with custom ground contour,
    // CONCEPTUAL_GROUND_LINE y-values should be at or slightly ABOVE the top y-values of your custom path.
    const CONCEPTUAL_GROUND_LINE = {
        x1: 0,    y1: 760,  // Adjusted to match example path start, or slightly less
        x2: IMAGE_SETTINGS.width, y2: 930 // Adjust y2 to match your path's rightmost top point
    };

    const CONCEPTUAL_REFERENCE_DEPTH_LINE = {
        depth_m: 4,             // Real-world depth of this reference line in meters
        // x1: 0,    y1: 3347,   // Start point (left edge of image)
        x1: 0,    y1: 2100,   // Start point (left edge of image)
        x2: IMAGE_SETTINGS.width, y2: IMAGE_SETTINGS.height    // End point (right edge of image)
    };

    const CUSTOM_GROUND_PATH_FILE = "assets/data/custom_ground_path.txt";
    const ANIMATION_DURATION_PER_MONTH = 0.2; // Seconds per month in the animation
    const TEMPERATURE_PROFILE_RESOLUTION_M = 0.05; // Meters. Smaller = smoother gradient, more elements.
    const TEMPERATURE_OVERLAY_INITIAL_OPACITY = 0.35; 
    const DEPTH_GRADIENT_OPACITY = 0.2;
    const DEPTH_SCALE_DIVISIONS = 4; // Number of divisions for the depth scale

    // --- Color & Style Configurations ---
    const DEPTH_GRADIENT_COLORS = {
        start: "#4C586D", // Color at 0m (ground surface)
        end: "#292D34"    // Color at 15m (or max visible depth if less than 15m)
    };
    // const TEMPERATURE_COLOR_SCALE_CONFIG = { // No longer using continuous scale
    //     domain: [-5, 0, 5],
    //     range: ["#2C484F", "#C3DDE9", "#8e7137"] 
    // };
    const TEMP_COLOR_ABOVE_ZERO = "#716749";
    const TEMP_COLOR_BELOW_ZERO = "#378BB1";
    const FROST_LINE_STYLE = {
        stroke: "#cbf3f0", // Changed to match ANNUAL_MAX_FROST_LINE_STYLE.stroke
        strokeWidth: 2, 
        strokeDasharray: "none" , 
        strokeOpacity: 0.8
    };
    const ANNUAL_MAX_FROST_LINE_STYLE = {
        stroke: "#cbf3f0", 
        strokeWidth: 4,
        // strokeDasharray: "5,5" // Kept as per user's previous file state
        strokeOpacity: 0.8, 
        labelFill: "#364156" 
    };
    const VERTICAL_LABEL_PADDING = 10; // Pixels between labels
    const LABEL_FONT_SIZE = 35; // For annual max labels
    const ESTIMATED_LABEL_HEIGHT = LABEL_FONT_SIZE * 0.8; // Approx height for collision
    // --- End Color & Style Configurations ---
    
    // Initialize animationData and a flag for data processing completion
    let animationData = [];
    let initialDataProcessed = false;
    let mainAnimTl; 

    // Load custom path data first
    let CUSTOM_CROSS_SECTION_PATH_D;
    try {
        const response = await fetch(CUSTOM_GROUND_PATH_FILE);
        if (!response.ok) {
            throw new Error(`Failed to load custom path data: ${response.status} ${response.statusText}`);
        }
        CUSTOM_CROSS_SECTION_PATH_D = await response.text();
        if (!CUSTOM_CROSS_SECTION_PATH_D || CUSTOM_CROSS_SECTION_PATH_D.trim() === "") {
            // If file is empty, but exists, use a default path or throw error
            // This might happen if python script runs but path ID is wrong / path is empty
             console.warn("Custom path data file loaded but was empty. Ensure SVG path ID is correct and path has data.");
            throw new Error("Custom path data file is empty."); // More specific error
        }
        console.log("Custom ground path data loaded successfully.");
    } catch (error) {
        console.error("Error loading or using custom ground path data:", error);
        // Optionally, provide a fallback default path or display an error to the user
        // For now, we'll use a very simple rectangular fallback if loading fails
        // to prevent the rest of the script from breaking entirely.
        console.warn("Using a fallback rectangular path due to loading error.");
        const fallbackTopY = Math.min(CONCEPTUAL_GROUND_LINE.y1, CONCEPTUAL_GROUND_LINE.y2);
        const fallbackBottomY = IMAGE_SETTINGS.height;
        CUSTOM_CROSS_SECTION_PATH_D = `M0,${fallbackTopY} L${IMAGE_SETTINGS.width},${fallbackTopY} L${IMAGE_SETTINGS.width},${fallbackBottomY} L0,${fallbackBottomY} Z`;
    }

    // We need to determine the actual min/max Y of the custom ground path for the gradient.
    const groundPathApproxMinY = Math.min(CONCEPTUAL_GROUND_LINE.y1, CONCEPTUAL_GROUND_LINE.y2); // 863 is the start of the path in current example
    const groundPathMaxY = IMAGE_SETTINGS.height; // Path extends to bottom

    const DATA_COLUMNS_DEPTHS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 19];
    const MAX_DATA_DEPTH = 19;
    
    const conceptualPixelsPerMeterAtX0 = 
        (CONCEPTUAL_REFERENCE_DEPTH_LINE.y1 - CONCEPTUAL_GROUND_LINE.y1) / CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
    // VISUALIZATION_MAX_DEPTH determines how far down we render things. 
    // It should ideally not exceed MAX_DATA_DEPTH if we rely on CSV for temps that far.
    const VISUALIZATION_MAX_RENDER_DEPTH = Math.min(MAX_DATA_DEPTH, 
        (groundPathMaxY - CONCEPTUAL_GROUND_LINE.y1) / conceptualPixelsPerMeterAtX0
    );
    // console.log(`Max depth for rendering temperature profile: ${VISUALIZATION_MAX_RENDER_DEPTH.toFixed(2)}m`);

    const svg = d3.select("#arctic-svg-overlay")
        .attr("viewBox", `0 0 ${IMAGE_SETTINGS.width} ${IMAGE_SETTINGS.height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // const tempOverlayColorScale = d3.scaleLinear() // No longer needed
    //     .domain(TEMPERATURE_COLOR_SCALE_CONFIG.domain)
    //     .range(TEMPERATURE_COLOR_SCALE_CONFIG.range)
    //     .clamp(true);

    function getYForDepth(depthInMeters, xPosition) {
        const groundYAtX = CONCEPTUAL_GROUND_LINE.y1 + (CONCEPTUAL_GROUND_LINE.y2 - CONCEPTUAL_GROUND_LINE.y1) * (xPosition / IMAGE_SETTINGS.width);
        const refDepthYAtX = CONCEPTUAL_REFERENCE_DEPTH_LINE.y1 + (CONCEPTUAL_REFERENCE_DEPTH_LINE.y2 - CONCEPTUAL_REFERENCE_DEPTH_LINE.y1) * (xPosition / IMAGE_SETTINGS.width);
        const currentPixelsPerRefDepth = refDepthYAtX - groundYAtX;
        const currentPixelsPerMeter = currentPixelsPerRefDepth / CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        return groundYAtX + (depthInMeters * currentPixelsPerMeter);
    }

    const defs = svg.append("defs");

    const clipPath = defs.append("clipPath")
        .attr("id", "cross-section-clip")
        .append("path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D);

    // Gaussian Blur Filter for smoothing temperature overlay
    const blurFilter = defs.append("filter")
        .attr("id", "gaussianBlurFilter");
    blurFilter.append("feGaussianBlur")
        .attr("in", "SourceGraphic") // Apply blur to the original graphic
        .attr("stdDeviation", "2"); // Adjust blur amount (e.g., 0.5, 1, 2)

    const depthLinearGradient = defs.append("linearGradient")
        .attr("id", "depth-gradient")
        .attr("gradientUnits", "userSpaceOnUse") 
        .attr("x1", 0).attr("y1", groundPathApproxMinY) 
        .attr("x2", 0).attr("y2", groundPathMaxY);    
    depthLinearGradient.append("stop").attr("offset", "0%").attr("stop-color", DEPTH_GRADIENT_COLORS.start);
    depthLinearGradient.append("stop").attr("offset", "100%").attr("stop-color", DEPTH_GRADIENT_COLORS.end);

    const staticLinesGroup = svg.append("g").attr("id", "static-lines").style("opacity", 0);
    const crossSectionVisualsGroup = svg.append("g")
        .attr("id", "cross-section-visuals")
        .attr("clip-path", "url(#cross-section-clip)")
        .style("opacity", 0); // Initially hidden
        // For the "rise from bottom" effect, we will animate its transform: translateY

    crossSectionVisualsGroup.append("path")
        .attr("id", "static-depth-gradient-path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D)
        .style("fill", "url(#depth-gradient)")
        .style("opacity", DEPTH_GRADIENT_OPACITY);

    const temperatureOverlayGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "temperature-overlay-group")
        .style("opacity", 0) // START HIDDEN, will be shown when main animation begins
        .attr("filter", "url(#gaussianBlurFilter)"); 

    const annualMaxFrostLinesGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "annual-max-frost-lines-group");

    const frostLine = crossSectionVisualsGroup.append("line")
        .attr("id", "frost-line")
        .attr("stroke", FROST_LINE_STYLE.stroke)
        .attr("stroke-width", FROST_LINE_STYLE.strokeWidth)
        .attr("stroke-dasharray", FROST_LINE_STYLE.strokeDasharray)
        .style("opacity", 0); // Initially hidden, will be shown in Scene 2 for the first data point

    const depthScaleGroup = svg.append("g").attr("id", "depth-scale").style("opacity", 0);
    const monthYearDisplay = svg.append("text")
        .attr("id", "month-year-display")
        .attr("x", 100)
        .attr("y", 180)
        .attr("font-family", "Lato, sans-serif")
        .attr("font-size", "150px")
        .attr("font-weight", "bold").attr("fill", "black")
        .style("opacity", 0);
    
    // Static lines for reference (0m and 5m labels, 19m data depth) using CONCEPTUAL lines for positioning labels
    // staticLinesGroup.append("text") 
    //     .attr("x", 50).attr("y", CONCEPTUAL_GROUND_LINE.y1 - 20) 
    //     .text("Ground Level (defined by custom contour)").attr("font-family", "sans-serif")
    //     .attr("font-size", "50px").attr("fill", "black");
    
    // staticLinesGroup.append("text") 
    //     .attr("x", 50).attr("y", getYForDepth(CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m, 50) - 15) 
    //     .text(`Approx. ${CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m}m Depth (perspective ref)`).attr("font-family", "sans-serif")
    //     .attr("font-size", "50px").attr("fill", "darkgrey");

    const yAt19m_conceptual_start = getYForDepth(MAX_DATA_DEPTH, 0);
    if (yAt19m_conceptual_start <= IMAGE_SETTINGS.height) { 
        staticLinesGroup.append("text")
            .attr("x", 50).attr("y", yAt19m_conceptual_start - 10)
            .text(`${MAX_DATA_DEPTH}m Depth (Max Data)`).attr("font-family", "sans-serif")
            .attr("font-size", "40px").attr("fill", "#777777");
    }

    // Generate granular depth points for smoother temperature gradient
    const granularDepthPoints = [];
    for (let d = 0; d <= VISUALIZATION_MAX_RENDER_DEPTH; d += TEMPERATURE_PROFILE_RESOLUTION_M) {
        granularDepthPoints.push(parseFloat(d.toFixed(2))); // Keep some precision
    }
    // Ensure the very last point is exactly VISUALIZATION_MAX_RENDER_DEPTH if resolution doesn't align perfectly
    if (granularDepthPoints[granularDepthPoints.length - 1] < VISUALIZATION_MAX_RENDER_DEPTH && VISUALIZATION_MAX_RENDER_DEPTH > 0) {
        if (VISUALIZATION_MAX_RENDER_DEPTH - granularDepthPoints[granularDepthPoints.length - 1] > TEMPERATURE_PROFILE_RESOLUTION_M / 2 ){
             granularDepthPoints.push(VISUALIZATION_MAX_RENDER_DEPTH);
        } else {
            granularDepthPoints[granularDepthPoints.length -1] = VISUALIZATION_MAX_RENDER_DEPTH;
        }
    }
    console.log(`Generated ${granularDepthPoints.length} granular depth points for temperature profile.`);

    // Pre-create temperature layer polygons based on granular depth points
    granularDepthPoints.slice(0, -1).forEach((topLayerDepthMeters, i) => {
        const bottomLayerDepthMeters = granularDepthPoints[i+1];
        
        const y1_start_conceptual = getYForDepth(topLayerDepthMeters, 0);
        const y1_end_conceptual = getYForDepth(topLayerDepthMeters, IMAGE_SETTINGS.width);
        const y2_start_conceptual = getYForDepth(bottomLayerDepthMeters, 0);
        const y2_end_conceptual = getYForDepth(bottomLayerDepthMeters, IMAGE_SETTINGS.width);

        temperatureOverlayGroup.append("polygon")
            .attr("class", `temp-layer temp-layer-granular-${i}`)
            .attr("points", `${0},${y1_start_conceptual} ${IMAGE_SETTINGS.width},${y1_end_conceptual} ${IMAGE_SETTINGS.width},${y2_end_conceptual} ${0},${y2_start_conceptual}`)
            .attr("stroke", "none");
    });

    // --- Initial Auto-Playing Reveal Animation --- 
    const crossSectionRevealAmount = IMAGE_SETTINGS.height - groundPathApproxMinY; 
    gsap.set(crossSectionVisualsGroup.node(), {y: `+=${crossSectionRevealAmount}`}); // Start it off-screen (below)

    ScrollTrigger.create({
        trigger: ".visualization-container",
        start: "top 60%", // Start animation when 60% of viewport is above the container top
        once: true, // Play this animation only once
        onEnter: () => {
            console.log("Triggering initial reveal animation.");
            gsap.timeline()
                .to(crossSectionVisualsGroup.node(), {
                    y: 0, // Slide to final position
                    opacity: 1,
                    duration: 0.8, // Quick slide-up duration
                    ease: "power2.out"
                }, "reveal")
                .to(staticLinesGroup.node(), {
                    opacity: 1,
                    duration: 0.6,
                    ease: "power1.inOut"
                }, "reveal+=0.3")
                .call(() => { 
                    if (initialDataProcessed && animationData.length > 0) {
                        console.log("Reveal complete. Static depth gradient and lines are visible.");
                        // DO NOT draw temp layers or frost line here yet.
                    }
                });
        }
    });

    // --- Main Scroll-Scrubbed Timeline --- 
    d3.csv("assets/data/svalbard_borehole_data_3.csv").then(dataset => {
        const processedData = dataset.map(d => {
            const row = { MonthDisplay: d.Month };
            row.Month = d3.timeParse("%Y-%m")(d.Month);
            DATA_COLUMNS_DEPTHS.forEach(depthKey => {
                row[String(depthKey)] = d[String(depthKey)] !== "" && d[String(depthKey)] !== undefined ? +d[String(depthKey)] : null;
            });
            row.Zero_Crossing_Depth = d.Zero_Crossing_Depth !== "" && d.Zero_Crossing_Depth !== undefined ? +d.Zero_Crossing_Depth : null;
            return row;
        }).filter(d => d.Month !== null); // Removed date filter for now to process all data for annual max
        console.log(`Processed ${processedData.length} data entries for visualization.`);

        // Pre-calculate annual maximum frost depths
        const annualMaxFrostDepths = [];
        if (processedData.length > 0) {
            let currentYear = processedData[0].Month.getFullYear();
            let maxDepthThisYear = -1;
            let monthIndexOfMaxThisYear = -1;
            let recordOfMaxThisYear = null;

            processedData.forEach((d, index) => {
                const year = d.Month.getFullYear();
                if (year !== currentYear) {
                    if (recordOfMaxThisYear) {
                        annualMaxFrostDepths.push({
                            year: currentYear,
                            maxDepth: maxDepthThisYear,
                            monthIndex: monthIndexOfMaxThisYear, // Store index for timing
                            monthData: recordOfMaxThisYear // Store full data record for drawing
                        });
                    }
                    currentYear = year;
                    maxDepthThisYear = -1;
                    monthIndexOfMaxThisYear = -1;
                    recordOfMaxThisYear = null;
                }

                if (d.Zero_Crossing_Depth !== null && d.Zero_Crossing_Depth >= 0 && d.Zero_Crossing_Depth <= VISUALIZATION_MAX_RENDER_DEPTH) {
                    if (d.Zero_Crossing_Depth > maxDepthThisYear) {
                        maxDepthThisYear = d.Zero_Crossing_Depth;
                        monthIndexOfMaxThisYear = index;
                        recordOfMaxThisYear = d;
                    }
                }
            });
            // Add the last year's data
            if (recordOfMaxThisYear) {
                annualMaxFrostDepths.push({
                    year: currentYear,
                    maxDepth: maxDepthThisYear,
                    monthIndex: monthIndexOfMaxThisYear,
                    monthData: recordOfMaxThisYear
                });
            }
        }
        console.log("Annual Maximum Frost Depths:", annualMaxFrostDepths);

        // Filter data again if you had a date filter for the main animation
        animationData = processedData.filter(d => d.Month <= new Date('2019-04-30'));
        initialDataProcessed = true; // Set flag AFTER data is ready
        console.log(`Using ${animationData.length} data entries for main animation.`);

        // --- Create Depth Scale Elements (ensure this is done before tl definition) --- START
        const depthScaleX = IMAGE_SETTINGS.width / 2;
        const scaleMaxDepth = CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        const depthScaleTickValues = [];
        for (let i = 0; i <= DEPTH_SCALE_DIVISIONS; i++) {
            depthScaleTickValues.push((i / DEPTH_SCALE_DIVISIONS) * scaleMaxDepth);
        }
        const tickLength = 30; 

        depthScaleGroup.append("line")
            .attr("x1", depthScaleX).attr("y1", getYForDepth(0, depthScaleX))
            .attr("x2", depthScaleX).attr("y2", getYForDepth(scaleMaxDepth, depthScaleX))
            .attr("stroke", "#efefef").attr("stroke-width", 6); 

        depthScaleTickValues.forEach(depth => {
            const yTickStart = getYForDepth(depth, depthScaleX - tickLength);
            const yTickEnd = getYForDepth(depth, depthScaleX + tickLength);
            
            depthScaleGroup.append("line") 
                .attr("x1", depthScaleX - tickLength).attr("y1", yTickStart)
                .attr("x2", depthScaleX + tickLength).attr("y2", yTickEnd)
                .attr("stroke", "#efefef").attr("stroke-width", 4); 
            
            const dxText = (depthScaleX + tickLength) - (depthScaleX - tickLength);
            const dyText = yTickEnd - yTickStart;
            const angleRadText = Math.atan2(dyText, dxText);
            const angleDegText = angleRadText * (180 / Math.PI);

            const textGroup = depthScaleGroup.append("g")
                .attr("transform", `translate(${depthScaleX + tickLength + 30}, ${yTickEnd})`);

            // Conditional formatting for tick labels
            const labelText = (depth % 1 === 0) ? `${depth.toFixed(0)}m` : `${depth.toFixed(1)}m`;

            textGroup.append("text")
                .text(labelText) 
                .attr("font-family", "\"JetBrains Mono\", monospace") 
                .attr("font-size", "40px")  
                .attr("fill", "#efefef")    
                .attr("text-anchor", "start") 
                .attr("dominant-baseline", "middle") 
                .attr("transform", `skewY(${angleDegText})`); 
        });
        // --- Create Depth Scale Elements --- END

        // Helper function to get interpolated temperature at a specific granular depth
        function getInterpolatedTemp(granularDepth, monthData) {
            // Find the two original data depths that this granularDepth falls between
            let lowerBoundDepth = -1, upperBoundDepth = -1;
            for (let k = 0; k < DATA_COLUMNS_DEPTHS.length; k++) {
                if (DATA_COLUMNS_DEPTHS[k] <= granularDepth) {
                    lowerBoundDepth = DATA_COLUMNS_DEPTHS[k];
                } else {
                    upperBoundDepth = DATA_COLUMNS_DEPTHS[k];
                    break;
                }
            }

            // Handle edge cases: if granularDepth is outside the range of original data depths
            if (lowerBoundDepth === -1) return monthData[String(DATA_COLUMNS_DEPTHS[0])]; // Use temp at shallowest depth
            if (upperBoundDepth === -1) return monthData[String(lowerBoundDepth)];      // Use temp at deepest known original depth
            
            const tempAtLowerBound = monthData[String(lowerBoundDepth)];
            const tempAtUpperBound = monthData[String(upperBoundDepth)];

            if (tempAtLowerBound === null || tempAtLowerBound === undefined) return null; // Cannot interpolate
            if (tempAtUpperBound === null || tempAtUpperBound === undefined) return tempAtLowerBound; // Use lower if upper is missing
            if (lowerBoundDepth === upperBoundDepth) return tempAtLowerBound; // Should not happen if logic is right, but handles it
            if (lowerBoundDepth === granularDepth) return tempAtLowerBound;

            const fraction = (granularDepth - lowerBoundDepth) / (upperBoundDepth - lowerBoundDepth);
            return tempAtLowerBound + fraction * (tempAtUpperBound - tempAtLowerBound);
        }

        function drawTemperatureLayers(monthData) {
            granularDepthPoints.slice(0, -1).forEach((topLayerDepthMeters, i) => {
                // const bottomLayerDepthMeters = granularDepthPoints[i+1]; // Not needed for color
                const interpolatedTemp = getInterpolatedTemp(topLayerDepthMeters, monthData);
                const layerPolygon = temperatureOverlayGroup.select(`.temp-layer-granular-${i}`);
                
                if (interpolatedTemp !== null && interpolatedTemp !== undefined && !layerPolygon.empty()) {
                    // layerPolygon.attr("fill", tempOverlayColorScale(interpolatedTemp)); // Old way
                    if (interpolatedTemp < 0) {
                        layerPolygon.attr("fill", TEMP_COLOR_BELOW_ZERO);
                    } else { // >= 0 including exactly 0
                        layerPolygon.attr("fill", TEMP_COLOR_ABOVE_ZERO);
                    }
                } else if (!layerPolygon.empty()){
                    layerPolygon.attr("fill", "none"); 
                }
            });
        }

        function updateFrostLine(monthData) {
            if (monthData.Zero_Crossing_Depth !== null && monthData.Zero_Crossing_Depth !== undefined && monthData.Zero_Crossing_Depth >= 0) {
                const yFrost_start = getYForDepth(monthData.Zero_Crossing_Depth, 0);
                const yFrost_end = getYForDepth(monthData.Zero_Crossing_Depth, IMAGE_SETTINGS.width);
                // Ensure frost line is only drawn if it's within the rendered depth
                if (monthData.Zero_Crossing_Depth <= VISUALIZATION_MAX_RENDER_DEPTH && Math.min(yFrost_start, yFrost_end) < IMAGE_SETTINGS.height && Math.max(yFrost_start, yFrost_end) > 0){
                    frostLine
                        .attr("x1", 0).attr("y1", yFrost_start)
                        .attr("x2", IMAGE_SETTINGS.width).attr("y2", yFrost_end)
                        .style("opacity", 1).raise(); 
                } else {
                     frostLine.style("opacity", 0);
                }
            } else {
                frostLine.style("opacity", 0);
            }
        }

        const dateFormat = d3.timeFormat("%Y %b"); // YYYY Mon format (e.g., 2008 Sep)

        if (animationData.length > 0) { 
            monthYearDisplay.text(dateFormat(animationData[0].Month)).style("opacity", 0); 
            // Initial draw for safety, though auto-reveal should handle it.
            // However, these depend on `animationData` which is set here.
            // The auto-reveal's .call() will execute if data is ready by then.
            // If data processing is very fast, it will be ready.
            // Let's ensure drawTemperatureLayers & updateFrostLine are called *after* reveal if data is ready then.
            // The reveal onEnter might fire before d3.csv().then() completes.
            // So, the call within revealTl is the primary point for initial draw.
        }

        const scrollDistanceForAnimation = animationData.length * 100; 

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: ".visualization-container",
                start: "top top", // Pinning starts when container top hits viewport top
                end: () => `+=${150 + scrollDistanceForAnimation}`, // Adjusted base for scenes
                scrub: 1,
                pin: true,
                // markers: true
            }
        });
        
        // Scene 1 (was Scene 2): Depth Scale Appears & Initial Frost Line
        // This now starts the scrubbed animation sequence
        tl.to(depthScaleGroup.node(), { opacity: 1, duration: 0.7 }, "scene1_scale_start");
        
        // NO initial draw/update of temp layers or frost line here anymore.
        // tl.call(() => {
        //     if (animationData.length > 0) {
        //         drawTemperatureLayers(animationData[0]); 
        //         updateFrostLine(animationData[0]); 
        //     }
        // }, [], "scene1_scale_start"); 

        // Scene 2 (was Scene 3): Month/Year display appears, and main data animation starts
        tl.to(monthYearDisplay.node(), { opacity: 1, duration: 0.5 }, "scene2_anim_start");

        tl.call(() => {
            console.log("Start main animation loop triggered by ScrollTrigger.");
            
            // Make temperature overlay and frost line visible NOW
            temperatureOverlayGroup.style("opacity", TEMPERATURE_OVERLAY_INITIAL_OPACITY);
            // frostLine opacity will be handled by the first call to updateFrostLine() inside mainAnimTl

            if (mainAnimTl && gsap.globalTimeline.getChildren(true, true, false).includes(mainAnimTl)) {
                console.log("Main animation timeline previously existed. Killing and restarting.");
                mainAnimTl.kill(); 
            }
            mainAnimTl = gsap.timeline(); 
            
            const drawnAnnualMaxYears = new Set(); 
            const placedAnnualMaxLabels = []; // Stores {yTop, yBottom} of placed labels

            animationData.forEach((d, index) => {
                mainAnimTl.call(() => {
                    drawTemperatureLayers(d);
                    updateFrostLine(d);
                    monthYearDisplay.text(dateFormat(d.Month));
                    
                    annualMaxFrostDepths.forEach(annualMax => {
                        if (d.Month.getFullYear() === annualMax.year && d.Month.getMonth() === annualMax.monthData.Month.getMonth() && !drawnAnnualMaxYears.has(annualMax.year)) {
                            console.log(`Drawing max frost line for ${annualMax.year} at depth ${annualMax.maxDepth}`);
                            const yFrostStart = getYForDepth(annualMax.maxDepth, 0);
                            const yFrostEnd = getYForDepth(annualMax.maxDepth, IMAGE_SETTINGS.width);
                            annualMaxFrostLinesGroup.append("line")
                                .attr("x1", 0).attr("y1", yFrostStart)
                                .attr("x2", IMAGE_SETTINGS.width).attr("y2", yFrostEnd)
                                .attr("stroke", ANNUAL_MAX_FROST_LINE_STYLE.stroke)
                                .attr("stroke-width", ANNUAL_MAX_FROST_LINE_STYLE.strokeWidth)
                                .attr("stroke-dasharray", ANNUAL_MAX_FROST_LINE_STYLE.strokeDasharray)
                                .attr("stroke-opacity", ANNUAL_MAX_FROST_LINE_STYLE.strokeOpacity || 1)
                                .attr("class", `annual-max-frost-line year-${annualMax.year}`);
                            
                            // Label placement logic
                            let targetY = yFrostEnd; // Initial desired Y (align middle of text with line end)
                            let needsAdjustment = true;
                            let attempts = 0; // Safety break for while loop

                            while (needsAdjustment && attempts < placedAnnualMaxLabels.length + 2) {
                                needsAdjustment = false;
                                attempts++;
                                for (const placedLabel of placedAnnualMaxLabels) {
                                    // Check if the new label (centered at targetY) would overlap with an existing one
                                    const newLabelTop = targetY - (ESTIMATED_LABEL_HEIGHT / 2);
                                    const newLabelBottom = targetY + (ESTIMATED_LABEL_HEIGHT / 2);

                                    if (newLabelTop < placedLabel.yBottom + VERTICAL_LABEL_PADDING && 
                                        newLabelBottom > placedLabel.yTop - VERTICAL_LABEL_PADDING) {
                                        targetY = placedLabel.yBottom + VERTICAL_LABEL_PADDING + (ESTIMATED_LABEL_HEIGHT / 2);
                                        needsAdjustment = true;
                                        break; // Restart checks with the new targetY
                                    }
                                }
                            }

                            staticLinesGroup.append("text")
                                .attr("x", IMAGE_SETTINGS.width + 30) 
                                .attr("y", targetY) // Use the adjusted Y
                                .text(`${annualMax.year} Max`)
                                .attr("font-family", "\"JetBrains Mono\", monospace")
                                .attr("font-size", `${LABEL_FONT_SIZE}px`)
                                .attr("fill", ANNUAL_MAX_FROST_LINE_STYLE.labelFill) 
                                .attr("text-anchor", "start")
                                .attr("dominant-baseline", "middle");
                            
                            placedAnnualMaxLabels.push({
                                yTop: targetY - (ESTIMATED_LABEL_HEIGHT / 2),
                                yBottom: targetY + (ESTIMATED_LABEL_HEIGHT / 2)
                            });
                            placedAnnualMaxLabels.sort((a,b) => a.yTop - b.yTop); // Keep sorted for easier checking

                            drawnAnnualMaxYears.add(annualMax.year);
                        }
                    });
                }, [], `+=${ANIMATION_DURATION_PER_MONTH}`);
            });
        }, [], "scene2_anim_start+=0.1"); // Start main animation slightly after scale and month/year start appearing

    }).catch(error => {
        console.error("Error loading or parsing CSV data:", error);
    });

    console.log("Initial setup (after path load attempt) complete. Waiting for CSV data and GSAP.");
}); 