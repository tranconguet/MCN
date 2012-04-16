"use strict";

var withBuffer = function (file, fn) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", file);
  xhr.responseType = "arraybuffer";
  xhr.onload = function (event) {
    var buffer = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
    fn(buffer);
  };
  xhr.send();
};

var withMessage = function (message) {
  return function (error) {
    return error.message === message;
  };
};


module("File Header");

asyncTest("throws on invalid file header ID", function () {
  withBuffer("corrupt-id.jbig2", function (buffer) {
    raises(function () {
      JBIG2.parse(buffer);
    }, withMessage("Control header check has failed"));
    start();
  });
});

asyncTest("throws on non-zero reserved bits in file header flags", function () {
  withBuffer("non-zero-reserved-bit.jbig2", function (buffer) {
    raises(function () {
      JBIG2.parse(buffer);
    }, withMessage("Reserved bits (2-7) of file header flags are not zero"));
    start();
  });
});

asyncTest("parses correct file organization", function () {
  withBuffer("annex-h.jbig2", function (buffer) {
    var decoded = JBIG2.parse(buffer);
    equal(decoded.sequential, true);
    equal(decoded.fileOrganization, JBIG2.SEQUENTIAL);
    start();
  });
});

asyncTest("parses correct number of pages", function () {
  withBuffer("annex-h.jbig2", function (buffer) {
    var decoded = JBIG2.parse(buffer);
    equal(decoded.pageCount, 3);
    start();
  });
});


module("Segment Header");

test("spec example 1", function () {
  var buffer = JBIG2.streamFrom(new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // segment number
    0x86,                   // header flags
    0x6B,                   // referred-to segment count and retention flags
    0x02, 0x1E, 0x05,       // referred-to segment numbers
    0x04                    // page association number
  ]));
  var header = JBIG2.parseSegmentHeader(buffer);

  equal(header.number, 32);
  equal(header.flags.segmentType, JBIG2.segmentTypes.IMMEDIATE_TEXT_REGION);
  equal(header.flags.pageAssociationSizeInBytes, 1);
  equal(header.flags.deferredNonRetain, true);
  equal(header.refSegmentCountAndRetentionFlags.refSegmentCount, 3);
  // 1011, i.e. the second referred-to segment need not be retained
  equal(header.refSegmentCountAndRetentionFlags.retentionFlags, 0x0B);
  deepEqual(header.referredSegments, [2, 30, 5]);
  equal(header.pageAssociation, 4);
});

test("spec example 2", function () {
  var buffer = JBIG2.streamFrom(new Uint8Array([
    0x00, 0x00, 0x02, 0x34,             // segment header
    0x40,                               // header flags
    0xE0, 0x00, 0x00, 0x09, 0x02, 0xFD, // referred-to segment count and retention flags
    // referred-to segment numbers, 2 bytes for each numbers because the
    // current segment number is strictly greater than 256
    0x01, 0x00,
    0x00, 0x02,
    0x00, 0x1E,
    0x00, 0x05,
    0x02, 0x00,
    0x02, 0x01,
    0x02, 0x02,
    0x02, 0x03,
    0x02, 0x04,
    // page association number
    0x00, 0x00, 0x04, 0x01
  ]));
  var header = JBIG2.parseSegmentHeader(buffer);

  equal(header.number, 564);
  equal(header.flags.segmentType, JBIG2.segmentTypes.SYMBOL_DICTIONARY);
  equal(header.flags.pageAssociationSizeInBytes, 4);
  equal(header.flags.deferredNonRetain, false);
  equal(header.refSegmentCountAndRetentionFlags.refSegmentCount, 9);
  // 10 1111 1101, i.e. the second referred-to segment need not be retained
  equal(header.refSegmentCountAndRetentionFlags.retentionFlags[0], 0x02);
  equal(header.refSegmentCountAndRetentionFlags.retentionFlags[1], 0xFD);
  deepEqual(header.referredSegments, [256, 2, 30, 5, 512, 513, 514, 515, 516]);
  equal(header.pageAssociation, 1025);
});

test("spec annex H example", function () {
  var buffer = JBIG2.streamFrom(new Uint8Array([
    0x00, 0x00, 0x00, 0x00, // segment number
    0x00,                   // header flags
    0x01,                   // referred-to segment count and retention flags
    0x00,                   // page association size
    0x00, 0x00, 0x00, 0x18  // segment data length
  ]));
  var header = JBIG2.parseSegmentHeader(buffer);

  equal(header.number, 0);
  equal(header.flags.segmentType, JBIG2.segmentTypes.SYMBOL_DICTIONARY);
  equal(header.flags.pageAssociationSizeInBytes, 1);
  equal(header.flags.deferredNonRetain, false);
  equal(header.refSegmentCountAndRetentionFlags.refSegmentCount, 0);
  equal(header.refSegmentCountAndRetentionFlags.retentionFlags, 0x01);
  equal(header.pageAssociation, 0);
  equal(header.dataLength, 24);
});


module("Symbol Dictionary Segment");

test("tenth segment header from Annex H example", function () {
  var buffer = JBIG2.streamFrom(new Uint8Array([
    0x00, 0x00, 0x00, 0x09, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x1B
  ]));
  var header = JBIG2.parseSegmentHeader(buffer);

  equal(header.number, 9);
  equal(header.flags.segmentType, JBIG2.segmentTypes.SYMBOL_DICTIONARY);
  equal(header.flags.pageAssociationSizeInBytes, 1);
  equal(header.flags.deferredNonRetain, false);
  equal(header.refSegmentCountAndRetentionFlags.refSegmentCount, 0);
  equal(header.refSegmentCountAndRetentionFlags.retentionFlags, 0x01);
  equal(header.pageAssociation, 2);
  equal(header.dataLength, 27);
});

test("tenth segment data from Annex H example", function () {
  var header = JBIG2.parseSegmentHeader(JBIG2.streamFrom(new Uint8Array([
    0x00, 0x00, 0x00, 0x09, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x1B
  ])));

  var data = JBIG2.streamFrom(new Uint8Array([
    0x08, 0x00, 0x02, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
    0x4F, 0xE7, 0x8C, 0x20, 0x0E, 0x1D, 0xC7, 0xCF, 0x01, 0x11, 0xC4, 0xB2,
    0x6F, 0xFF, 0xAC
  ]));
  var parsedDataHeader = JBIG2.parseSymbolDictionaryDataHeader(header, data);

  equal(parsedDataHeader.encoding, JBIG2.ARITH_ENCODING);
  equal(parsedDataHeader.useRefinementAggregateCoding, false);
  equal(parsedDataHeader.huffmanTables.deltaHeight, "B.4");
  equal(parsedDataHeader.huffmanTables.deltaWidth, "B.2");
  equal(parsedDataHeader.huffmanTables.heightClassCollective, "B.1");
  equal(parsedDataHeader.huffmanTables.aggregationSymbolInstanceCount, "B.1");
  equal(parsedDataHeader.sdTemplate, 2);
  equal(parsedDataHeader.sdrTemplate, 0);
  equal(parsedDataHeader.usedBitmapCodingContext, 0);
  equal(parsedDataHeader.retainedBitmapCodingContext, 0);
  deepEqual(parsedDataHeader.templatePixels.A, [{x:2, y:-1}]);
  equal(parsedDataHeader.exportedSymbols, 2);
  equal(parsedDataHeader.definedSymbols, 2);
});
