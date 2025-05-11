document.addEventListener('DOMContentLoaded', async () => {
    console.log("Arctic Visualization Script Loaded");

    // --- Configuration Variables ---
    // These are the main variables you will update based on your image and SVG path.

    const IMAGE_SETTINGS = {
        width: 4096,
        height: 4728 
    };

    // IMPORTANT: For temperature overlay to align with custom ground contour,
    // CONCEPTUAL_GROUND_LINE y-values should be at or slightly ABOVE the top y-values of your custom path.
    const CONCEPTUAL_GROUND_LINE = {
        x1: 0,    y1: 1245,  // Adjusted to match example path start, or slightly less
        x2: IMAGE_SETTINGS.width, y2: 1561 // Adjust y2 to match your path's rightmost top point
    };

    const CONCEPTUAL_REFERENCE_DEPTH_LINE = {
        depth_m: 10,             // Real-world depth of this reference line in meters
        // x1: 0,    y1: 3347,   // Start point (left edge of image)
        x1: 0,    y1: 3500,   // Start point (left edge of image)
        x2: IMAGE_SETTINGS.width, y2: IMAGE_SETTINGS.height    // End point (right edge of image)
    };

    const CUSTOM_GROUND_PATH_FILE = "assets/data/custom_ground_path.txt";
    const ANIMATION_DURATION_PER_MONTH = 0.1; // Seconds per month in the animation
    const TEMPERATURE_PROFILE_RESOLUTION_M = 0.05; // Meters. Smaller = smoother gradient, more elements.
    const TEMPERATURE_OVERLAY_INITIAL_OPACITY = 0.6; 

    // --- Color & Style Configurations ---
    const DEPTH_GRADIENT_COLORS = {
        start: "#C3DDE9", // Color at 0m (ground surface)
        end: "#5E3719"    // Color at 15m (or max visible depth if less than 15m)
    };
    const TEMPERATURE_COLOR_SCALE_CONFIG = {
        domain: [-20, 0, 10],
        range: ["#A1A6A4", "#C3DDE9", "#7e660c"] // -20C, 0C, +30C
    };
    const FROST_LINE_STYLE = {
        stroke: "#EEFFFD",
        strokeWidth: 7, // Remains a decent width
        strokeDasharray: "none" // Solid line
    };
    const ANNUAL_MAX_FROST_LINE_STYLE = {
        stroke: "#EFEFEF", // Bright yellow for distinction
        strokeWidth: 8,
        // strokeDasharray: "5,5" // Dashed line
    };
    // --- End Color & Style Configurations ---
    
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
    console.log(`Max depth for rendering temperature profile: ${VISUALIZATION_MAX_RENDER_DEPTH.toFixed(2)}m`);

    const svg = d3.select("#arctic-svg-overlay")
        .attr("viewBox", `0 0 ${IMAGE_SETTINGS.width} ${IMAGE_SETTINGS.height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const tempOverlayColorScale = d3.scaleLinear()
        .domain(TEMPERATURE_COLOR_SCALE_CONFIG.domain)
        .range(TEMPERATURE_COLOR_SCALE_CONFIG.range)
        .clamp(true);

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

    const staticLinesGroup = svg.append("g").attr("id", "static-lines");
    const crossSectionVisualsGroup = svg.append("g")
        .attr("id", "cross-section-visuals")
        .attr("clip-path", "url(#cross-section-clip)");

    crossSectionVisualsGroup.append("path")
        .attr("id", "static-depth-gradient-path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D)
        .style("fill", "url(#depth-gradient)");

    const temperatureOverlayGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "temperature-overlay-group")
        .style("opacity", TEMPERATURE_OVERLAY_INITIAL_OPACITY) 
        .attr("filter", "url(#gaussianBlurFilter)"); // Apply the blur filter

    const annualMaxFrostLinesGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "annual-max-frost-lines-group");

    const frostLine = crossSectionVisualsGroup.append("line")
        .attr("id", "frost-line")
        .attr("stroke", FROST_LINE_STYLE.stroke)
        .attr("stroke-width", FROST_LINE_STYLE.strokeWidth)
        .attr("stroke-dasharray", FROST_LINE_STYLE.strokeDasharray);

    const depthScaleGroup = svg.append("g").attr("id", "depth-scale").style("opacity", 0);
    const monthYearDisplay = svg.append("text")
        .attr("id", "month-year-display")
        .attr("x", 70).attr("y", 120).attr("font-family", "Lato, sans-serif")
        .attr("font-size", "90px").attr("font-weight", "bold").attr("fill", "black")
        .style("opacity", 0);
    
    staticLinesGroup.append("text") 
        .attr("x", 50).attr("y", CONCEPTUAL_GROUND_LINE.y1 - 20) 
        .text("Ground Level (defined by custom contour)").attr("font-family", "sans-serif")
        .attr("font-size", "50px").attr("fill", "black");
    
    staticLinesGroup.append("text") 
        .attr("x", 50).attr("y", getYForDepth(CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m, 50) - 15) 
        .text(`Approx. ${CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m}m Depth (perspective ref)`).attr("font-family", "sans-serif")
        .attr("font-size", "50px").attr("fill", "darkgrey");

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

    d3.csv("assets/data/svalbard_borehole_data_1.csv").then(dataset => {
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
        const animationData = processedData.filter(d => d.Month <= new Date('2019-12-31'));
        console.log(`Using ${animationData.length} data entries for main animation.`);

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
                    layerPolygon.attr("fill", tempOverlayColorScale(interpolatedTemp));
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

        if (processedData.length > 0) {
            drawTemperatureLayers(processedData[0]);
            updateFrostLine(processedData[0]);
            monthYearDisplay.text(processedData[0].MonthDisplay).style("opacity", 0);
        }

        const scrollDistanceForAnimation = processedData.length * 20;

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: ".visualization-container",
                start: "top top",
                end: () => `+=${150 + scrollDistanceForAnimation}`,
                scrub: 1,
                pin: true,
                // markers: true
            }
        });

        tl.to({}, { duration: 0.5 }, "scene1"); 
        
        const depthScaleX = IMAGE_SETTINGS.width / 2;
        const scaleMaxDepth = CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        const numberOfDivisions = 5;
        const depthScaleTickValues = [];
        for (let i = 0; i <= numberOfDivisions; i++) {
            depthScaleTickValues.push((i / numberOfDivisions) * scaleMaxDepth);
        }
        const tickLength = 30; // Horizontal length of ticks from center to one side - REDUCED

        // Main vertical line of the scale
        depthScaleGroup.append("line")
            .attr("x1", depthScaleX).attr("y1", getYForDepth(0, depthScaleX))
            .attr("x2", depthScaleX).attr("y2", getYForDepth(scaleMaxDepth, depthScaleX))
            .attr("stroke", "#efefef").attr("stroke-width", 6); // Thicker and new color

        // Ticks and labels
        depthScaleTickValues.forEach(depth => {
            // For perspective ticks, calculate y at slightly offset x positions
            const yTickStart = getYForDepth(depth, depthScaleX - tickLength);
            const yTickEnd = getYForDepth(depth, depthScaleX + tickLength);
            
            depthScaleGroup.append("line") // Tick mark
                .attr("x1", depthScaleX - tickLength).attr("y1", yTickStart)
                .attr("x2", depthScaleX + tickLength).attr("y2", yTickEnd)
                .attr("stroke", "#efefef").attr("stroke-width", 4); 
            
            // Calculate angle for skewY
            const dx = (depthScaleX + tickLength) - (depthScaleX - tickLength); // This is 2 * tickLength
            const dy = yTickEnd - yTickStart;
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = angleRad * (180 / Math.PI);

            // Create a group for each text label for precise positioning and transformation
            const textGroup = depthScaleGroup.append("g")
                .attr("transform", `translate(${depthScaleX + tickLength + 30}, ${yTickEnd})`);

            textGroup.append("text")
                .text(`${depth.toFixed(0)}m`) 
                .attr("font-family", "\"JetBrains Mono\", monospace") 
                .attr("font-size", "80px")  
                .attr("fill", "#efefef")    
                .attr("text-anchor", "start") // Text will start at the translated point (0,0 of the group)
                .attr("dominant-baseline", "middle") // Vertical middle of text at (0,0 of the group)
                .attr("transform", `skewY(${angleDeg})`); 
        });

        tl.to(depthScaleGroup.node(), { opacity: 1, duration: 0.5 }, "scene2_start");
        tl.to({}, { duration: 1 }, "scene2_end"); 

        // Scene 3: Start animation (show month/year), depth scale remains visible
        // tl.to(depthScaleGroup.node(), { opacity: 0, duration: 0.5 }, "scene3_start"); // REMOVED: Keep scale visible
        tl.to(monthYearDisplay.node(), { opacity: 1, duration: 0.5 }, "scene3_start");

        tl.call(() => {
            console.log("Start main animation loop triggered by ScrollTrigger.");
            gsap.timeline().to({}, {duration: 0.1}); 
            let mainAnimTl = gsap.timeline();

            // Keep track of drawn annual max lines to avoid duplicates if animation loops or is re-triggered
            const drawnAnnualMaxYears = new Set();

            animationData.forEach((d, animationFrameIndex) => {
                mainAnimTl.call(() => {
                    drawTemperatureLayers(d);
                    updateFrostLine(d);
                    monthYearDisplay.text(d.MonthDisplay);

                    // Check if this frame corresponds to an annual max depth point to draw it persistently
                    annualMaxFrostDepths.forEach(annualMax => {
                        if (d.Month.getFullYear() === annualMax.year && d.Month.getMonth() === annualMax.monthData.Month.getMonth() && !drawnAnnualMaxYears.has(annualMax.year)) {
                            // Check if it's the specific month of the max depth for that year
                            // Or, more simply, draw when the year of current data `d` matches `annualMax.year`
                            // and the animation is at/past the month of that max.
                            // Let's draw when current month matches the month of the max to ensure data for that line is accurate.
                            
                            console.log(`Drawing max frost line for ${annualMax.year} at depth ${annualMax.maxDepth}`);
                            const yFrostStart = getYForDepth(annualMax.maxDepth, 0);
                            const yFrostEnd = getYForDepth(annualMax.maxDepth, IMAGE_SETTINGS.width);

                            annualMaxFrostLinesGroup.append("line")
                                .attr("x1", 0).attr("y1", yFrostStart)
                                .attr("x2", IMAGE_SETTINGS.width).attr("y2", yFrostEnd)
                                .attr("stroke", ANNUAL_MAX_FROST_LINE_STYLE.stroke)
                                .attr("stroke-width", ANNUAL_MAX_FROST_LINE_STYLE.strokeWidth)
                                .attr("stroke-dasharray", ANNUAL_MAX_FROST_LINE_STYLE.strokeDasharray)
                                .attr("class", `annual-max-frost-line year-${annualMax.year}`);
                            
                            annualMaxFrostLinesGroup.append("text")
                                .attr("x", IMAGE_SETTINGS.width - 250) // Position near the right edge
                                .attr("y", yFrostEnd - 10) // Slightly above the line end
                                .text(`${annualMax.year} Max`)
                                .attr("font-family", "\"JetBrains Mono\", monospace")
                                .attr("font-size", "35px")
                                .attr("fill", ANNUAL_MAX_FROST_LINE_STYLE.stroke)
                                .attr("text-anchor", "end");
                            drawnAnnualMaxYears.add(annualMax.year);
                        }
                    });

                }, [], `+=${ANIMATION_DURATION_PER_MONTH}`);
            });
        }, [], "scene3_end");

    }).catch(error => {
        console.error("Error loading or parsing CSV data:", error);
    });

    console.log("Initial setup (after path load attempt) complete. Waiting for CSV data and GSAP.");
}); 